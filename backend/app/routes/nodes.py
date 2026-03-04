"""Node CRUD operations, cloning, and config management."""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.broadcast import broadcast
from app.db import Node, emit_event, get_db
from app.docker_ops import (
    get_container_status,
    read_nanobot_config,
    read_workspace_file,
    stop_nanobot_container,
    write_nanobot_config,
    write_workspace_file,
    write_workspace_files_batch,
)
from app.routes.helpers import (
    ALLOWED_WORKSPACE_FILES,
    setup_container,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["nodes"])


# ---------------------------------------------------------------------------
# Pydantic models (shared -- imported by other route modules)
# ---------------------------------------------------------------------------

class NodeCreate(BaseModel):
    name: str = "new-nanobot"
    position_x: float = 0.0
    position_y: float = 0.0


class NodeUpdate(BaseModel):
    name: str | None = None
    position_x: float | None = None
    position_y: float | None = None
    width: float | None = None
    height: float | None = None


class NodeRead(BaseModel):
    id: UUID
    name: str
    container_id: str | None
    container_status: str | None
    position_x: float
    position_y: float
    width: float
    height: float
    config: dict | None
    identity: dict | None = None
    agent_status: str | None = None
    agent_status_message: str | None = None
    gauge_value: float | None = None
    gauge_label: str | None = None
    gauge_unit: str | None = None
    archived: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class CloneNodeRequest(BaseModel):
    position_x: float | None = None
    position_y: float | None = None


class UpdateNodeConfigRequest(BaseModel):
    config: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _sync_identity_name(container_id: str, new_name: str) -> None:
    """Update the name field in identity.json inside a container."""
    content = await asyncio.to_thread(read_workspace_file, container_id, "identity.json")
    if not content:
        return
    try:
        identity = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return
    if not isinstance(identity, dict):
        return
    identity["name"] = new_name
    await asyncio.to_thread(
        write_workspace_file, container_id, "identity.json", json.dumps(identity, indent=2)
    )


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

@router.post("/nodes", response_model=NodeRead)
async def create_node(payload: NodeCreate, db: AsyncSession = Depends(get_db)):
    node_id = uuid4()
    node = Node(
        id=node_id,
        name=payload.name,
        position_x=payload.position_x,
        position_y=payload.position_y,
    )

    # Spin up nanobot container with default config and templates
    try:
        await setup_container(node, db)
    except Exception as exc:
        node.container_status = "error"
        node.config = {"error": str(exc)}

    db.add(node)
    await db.commit()
    await db.refresh(node)
    await emit_event("node_created", node_id=node.id, node_name=node.name,
                     summary=f'Node "{node.name}" created')
    return node


@router.get("/nodes", response_model=list[NodeRead])
async def list_nodes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).order_by(Node.created_at))
    return result.scalars().all()


@router.get("/nodes/{node_id}", response_model=NodeRead)
async def get_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    # Refresh container status
    if node.container_id:
        node.container_status = await asyncio.to_thread(
            get_container_status, node.container_id
        )
        await db.commit()
    return node


@router.patch("/nodes/{node_id}", response_model=NodeRead)
async def update_node(node_id: UUID, payload: NodeUpdate, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    old_name = node.name
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(node, field, value)
    await db.commit()
    await db.refresh(node)

    # Keep container identity.json in sync when the node is renamed
    if "name" in updates and node.container_id:
        try:
            await _sync_identity_name(node.container_id, updates["name"])
        except Exception:
            logger.debug("Failed to sync identity.json after renaming node %s", node_id, exc_info=True)

    if "name" in updates and updates["name"] != old_name:
        await emit_event("node_renamed", node_id=node.id, node_name=node.name,
                         summary=f'Node renamed "{old_name}" \u2192 "{node.name}"',
                         details={"old_name": old_name, "new_name": node.name})
        await broadcast.publish("rename", {
            "node_id": str(node.id),
            "name": node.name,
        })

    return node


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    node_name = node.name
    # Stop and remove container
    if node.container_id:
        await asyncio.to_thread(stop_nanobot_container, node.container_id)
    await db.delete(node)
    await db.commit()
    await emit_event("node_deleted", node_id=None, node_name=node_name,
                     summary=f'Node "{node_name}" deleted')
    return {"ok": True}


# ---------------------------------------------------------------------------
# Clone
# ---------------------------------------------------------------------------

@router.post("/nodes/{node_id}/clone", response_model=NodeRead)
async def clone_node(node_id: UUID, request: CloneNodeRequest, db: AsyncSession = Depends(get_db)):
    """Clone a node: create a new container with the same config and workspace files."""
    source = await db.get(Node, node_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source node not found")

    new_id = uuid4()
    pos_x = request.position_x if request.position_x is not None else source.position_x + 120
    pos_y = request.position_y if request.position_y is not None else source.position_y + 60

    node = Node(
        id=new_id,
        name=f"{source.name}-clone",
        position_x=pos_x,
        position_y=pos_y,
    )

    try:
        # Create container with source config (skips default templates -- we
        # overwrite them below with the actual source workspace files).
        container_id = await setup_container(
            node, db, config_override=source.config or None,
        )

        # Copy identity
        if source.identity:
            node.identity = source.identity

        # Copy workspace files from source container (overwrites templates)
        if source.container_id:
            files_to_copy = set(ALLOWED_WORKSPACE_FILES)
            if source.identity and isinstance(source.identity, dict):
                for tab in source.identity.get("tabs", []):
                    if isinstance(tab, dict) and isinstance(tab.get("file"), str):
                        fname = tab["file"]
                        if "/" not in fname and "\\" not in fname and ".." not in fname:
                            files_to_copy.add(fname)
            # Read all source files, then batch write to new container
            batch: dict[str, str] = {}
            for filename in files_to_copy:
                content = await asyncio.to_thread(
                    read_workspace_file, source.container_id, filename
                )
                if content:
                    batch[filename] = content
            if batch:
                await asyncio.to_thread(
                    write_workspace_files_batch, container_id, batch
                )
    except Exception as exc:
        node.container_status = "error"
        node.config = {"error": str(exc)}

    db.add(node)
    await db.commit()
    await db.refresh(node)
    await emit_event("node_cloned", node_id=node.id, node_name=node.name,
                     summary=f'Node "{node.name}" cloned from "{source.name}"',
                     details={"source_id": str(source.id), "source_name": source.name})
    return node


# ---------------------------------------------------------------------------
# Config endpoints
# ---------------------------------------------------------------------------

@router.get("/nodes/{node_id}/config")
async def get_node_config(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    config = await asyncio.to_thread(read_nanobot_config, node.container_id)
    return {"config": config}


@router.put("/nodes/{node_id}/config")
async def update_node_config(node_id: UUID, request: UpdateNodeConfigRequest, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    await asyncio.to_thread(
        write_nanobot_config, node.container_id, request.config
    )
    # Cache config snapshot
    node.config = request.config
    await db.commit()
    return {"ok": True}
