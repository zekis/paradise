"""Agent status, gauge, logs, identity, restart, and rebuild endpoints."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.broadcast import broadcast
from app.db import Node, emit_event, get_db
from app.docker_ops import (
    get_container_logs,
    get_container_stats,
    get_container_status,
    read_workspace_file,
    restart_nanobot_container,
    stop_nanobot_container,
)
from app.routes.helpers import recreate_container, sync_identity_name

logger = logging.getLogger(__name__)

router = APIRouter(tags=["node-status"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AgentStatusRequest(BaseModel):
    status: str = ""
    message: str = ""


class GaugeRequest(BaseModel):
    value: float | None = None
    label: str = ""
    unit: str = ""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/nodes/{node_id}/logs")
async def node_logs(node_id: UUID, tail: int = 100, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    logs = await asyncio.to_thread(get_container_logs, node.container_id, tail)
    if logs is None:
        raise HTTPException(status_code=404, detail="Container not found or logs unavailable")
    return {"logs": logs}


@router.post("/nodes/{node_id}/restart")
async def restart_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # If container is gone, recreate it; otherwise just restart
    status = (
        await asyncio.to_thread(get_container_status, node.container_id)
        if node.container_id
        else "not_found"
    )
    if status == "not_found":
        try:
            await recreate_container(node, db)
        except Exception as exc:
            node.container_status = "error"
            raise HTTPException(status_code=500, detail=str(exc))
    else:
        await asyncio.to_thread(restart_nanobot_container, node.container_id)
        node.container_status = "running"

    await db.commit()
    await emit_event("container_restart", node_id=node.id, node_name=node.name,
                     summary=f'Container restarted for "{node.name}"')
    return {"ok": True}


@router.post("/nodes/{node_id}/rebuild")
async def rebuild_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Stop and remove the old container, create a fresh one from the current image."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Stop and remove old container
    if node.container_id:
        await asyncio.to_thread(stop_nanobot_container, node.container_id)

    # Create new container with config and templates
    try:
        await recreate_container(node, db)
    except Exception as exc:
        node.container_status = "error"
        raise HTTPException(status_code=500, detail=str(exc))

    await db.commit()
    await emit_event("container_rebuild", node_id=node.id, node_name=node.name,
                     summary=f'Container rebuilt for "{node.name}"')
    return {"ok": True}


@router.get("/nodes/{node_id}/stats")
async def get_node_stats(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    status = await asyncio.to_thread(get_container_status, node.container_id)
    if status == "not_found":
        raise HTTPException(status_code=404, detail="Container not found")
    stats = await asyncio.to_thread(get_container_stats, node.container_id)
    return {
        "container_id": node.container_id[:12],
        "status": status,
        "stats": stats,
        "name": node.name,
        "created_at": node.created_at,
    }


@router.put("/nodes/{node_id}/agent-status")
async def set_agent_status(node_id: UUID, request: AgentStatusRequest, db: AsyncSession = Depends(get_db)):
    """Set agent-reported status (ok, warning, error) from PARADISE.setStatus()."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    status = request.status.strip().lower()
    if status not in ("ok", "warning", "error", ""):
        raise HTTPException(status_code=400, detail="Status must be ok, warning, or error")
    node.agent_status = status or None
    node.agent_status_message = request.message[:200] or None
    await db.commit()
    msg = node.agent_status_message or ""
    await emit_event("agent_status", node_id=node.id, node_name=node.name,
                     summary=f'{node.name}: {status}' + (f' — {msg}' if msg else ''),
                     details={"status": status, "message": msg})
    await broadcast.publish("agent_status", {
        "node_id": str(node_id),
        "agent_status": node.agent_status,
        "agent_status_message": node.agent_status_message,
    })
    return {"ok": True, "agent_status": node.agent_status}


@router.put("/nodes/{node_id}/gauge")
async def set_gauge(node_id: UUID, request: GaugeRequest, db: AsyncSession = Depends(get_db)):
    """Set agent-reported gauge value (0-100) from PARADISE.setGauge()."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if request.value is None:
        node.gauge_value = None
        node.gauge_label = None
        node.gauge_unit = None
    else:
        value = request.value
        if value < 0 or value > 100:
            raise HTTPException(status_code=400, detail="value must be between 0 and 100")
        node.gauge_value = value
        node.gauge_label = request.label[:100] or None
        node.gauge_unit = request.unit[:20] or None
    await db.commit()
    await broadcast.publish("gauge", {
        "node_id": str(node_id),
        "gauge_value": node.gauge_value,
        "gauge_label": node.gauge_label,
        "gauge_unit": node.gauge_unit,
    })
    return {"ok": True, "gauge_value": node.gauge_value, "gauge_label": node.gauge_label, "gauge_unit": node.gauge_unit}


@router.get("/nodes/{node_id}/identity")
async def get_node_identity(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Read identity.json from the nanobot container and cache in DB."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    content = await asyncio.to_thread(
        read_workspace_file, node.container_id, "identity.json"
    )
    if not content:
        return {"identity": None}

    try:
        identity = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return {"identity": None}

    # Sync DB node name back into identity if it has drifted
    identity = await sync_identity_name(node.container_id, node.name, identity)

    # Cache in DB for fast canvas loads
    node.identity = identity
    await db.commit()

    return {"identity": identity}
