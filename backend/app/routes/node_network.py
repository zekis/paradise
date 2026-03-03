"""Network topology, peer config, recommendations, and child-node creation."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID, uuid4

from app.db import Edge, Node, emit_event, get_db
from app.docker_ops import (
    read_nanobot_config,
    read_workspace_file,
)
from app.routes.helpers import get_network_topology, node_summary, setup_container
from app.routes.nodes import NodeRead

logger = logging.getLogger(__name__)

router = APIRouter(tags=["node-network"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ChildNodeCreate(BaseModel):
    name: str
    genesis_prompt: str
    icon: str | None = None
    emoji: str | None = None
    description: str | None = None
    position_x: float | None = None
    position_y: float | None = None
    source_handle: str | None = None
    target_handle: str | None = None


class ChildNodeResponse(BaseModel):
    node: NodeRead
    edge_id: UUID
    genesis_prompt: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/nodes/{node_id}/network")
async def get_node_network(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get the network topology from this node's perspective.

    Parents = nodes with edges pointing into this node (source->this).
    Children = nodes this node points to (this->target).
    Siblings = other children of the same parents.
    """
    result = await get_network_topology(node_id, db, include_edge_types=True)
    if not result:
        raise HTTPException(status_code=404, detail="Node not found")
    return result


@router.get("/nodes/{node_id}/network/config/{peer_id}")
async def get_peer_config(node_id: UUID, peer_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get config and workspace files from a peer node (must be connected by an edge)."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    peer = await db.get(Node, peer_id)
    if not peer:
        raise HTTPException(status_code=404, detail="Peer not found")

    # Verify they are connected (edge in either direction)
    edge = (await db.execute(
        select(Edge).where(
            ((Edge.source_id == node_id) & (Edge.target_id == peer_id))
            | ((Edge.source_id == peer_id) & (Edge.target_id == node_id))
        )
    )).scalars().first()
    if not edge:
        raise HTTPException(status_code=403, detail="Nodes are not connected")

    # Read peer config and key workspace files.
    # read_nanobot_config returns None when the container or file is missing;
    # normalise to an empty dict so the response is always a JSON object.
    config = (
        await asyncio.to_thread(read_nanobot_config, peer.container_id)
        if peer.container_id
        else None
    ) or {}
    workspace_files: dict[str, str] = {}
    if peer.container_id:
        for filename in ("identity.json", "SOUL.md", "AGENTS.md", "dashboard.html", "commands.html", "api.py"):
            content = await asyncio.to_thread(
                read_workspace_file, peer.container_id, filename
            )
            if content:
                workspace_files[filename] = content

    return {
        "peer": node_summary(peer),
        "config": config,
        "workspace_files": workspace_files,
    }


@router.get("/nodes/{node_id}/recommendations")
async def get_recommendations(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Read recommendations.json from a node's container and return validated entries."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    content = await asyncio.to_thread(
        read_workspace_file, node.container_id, "recommendations.json"
    )
    if not content:
        return {"recommendations": []}

    try:
        data = json.loads(content)
        recs = data if isinstance(data, list) else data.get("recommendations", [])
        validated = []
        for r in recs:
            if not isinstance(r, dict) or not r.get("name") or not r.get("genesis_prompt"):
                continue
            validated.append({
                "name": str(r["name"])[:60],
                "genesis_prompt": str(r["genesis_prompt"]),
                "icon": str(r.get("icon", "")),
                "emoji": str(r.get("emoji", "")),
                "description": str(r.get("description", ""))[:200],
            })
        return {"recommendations": validated[:10]}
    except (json.JSONDecodeError, TypeError):
        return {"recommendations": []}


@router.post("/nodes/{parent_id}/children", response_model=ChildNodeResponse)
async def create_child_node(
    parent_id: UUID,
    payload: ChildNodeCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a child node from a recommendation, auto-creating the parent->child edge."""
    parent = await db.get(Node, parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent node not found")

    # Position child near parent
    pos_x = payload.position_x if payload.position_x is not None else parent.position_x + 120
    pos_y = payload.position_y if payload.position_y is not None else parent.position_y + 150

    # Enrich genesis prompt with parent context
    parts = [payload.genesis_prompt, "\n\n## Parent Context", f"Parent node: {parent.name}"]
    if parent.identity:
        parts.append(f"Parent identity: {json.dumps(parent.identity)}")
    if parent.container_id:
        settings_content = await asyncio.to_thread(
            read_workspace_file, parent.container_id, "settings.json"
        )
        if settings_content:
            parts.append(f"Parent settings: {settings_content}")
    enriched_prompt = "\n".join(parts)

    # Create child node
    node_id = uuid4()
    node = Node(
        id=node_id,
        name=payload.name,
        position_x=pos_x,
        position_y=pos_y,
    )

    try:
        await setup_container(node, db)
    except Exception as exc:
        node.container_status = "error"
        node.config = {"error": str(exc)}

    db.add(node)

    # Create edge: parent -> child
    edge = Edge(
        id=uuid4(),
        source_id=parent_id,
        target_id=node_id,
        edge_type="connection",
        source_handle=payload.source_handle or "bottom-s",
        target_handle=payload.target_handle or "top-t",
    )
    db.add(edge)

    await db.commit()
    await db.refresh(node)

    await emit_event(
        "child_node_created",
        node_id=node.id,
        node_name=node.name,
        summary=f'Child "{node.name}" created from "{parent.name}"',
        details={"parent_id": str(parent_id), "parent_name": parent.name},
    )

    return ChildNodeResponse(
        node=NodeRead.model_validate(node),
        edge_id=edge.id,
        genesis_prompt=enriched_prompt,
    )
