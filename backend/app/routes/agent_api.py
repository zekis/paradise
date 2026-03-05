"""External Agent API — clean programmatic access to the Paradise nanobot network."""

import asyncio
import json
import logging
import os
from datetime import datetime
from uuid import UUID

import websockets
from fastapi import APIRouter, Depends, HTTPException, Query, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import ChatMessage, Edge, Node, get_db
from app.routes.chat import MessageRead, _get_network_context, _nanobot_ws_url
from app.routes.helpers import get_chat_peers, get_network_topology

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

_API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
_REQUIRED_KEY = os.environ.get("PARADISE_AGENT_API_KEY")


async def verify_api_key(key: str | None = Security(_API_KEY_HEADER)):
    """Reject requests when PARADISE_AGENT_API_KEY is set and the header doesn't match."""
    if _REQUIRED_KEY and key != _REQUIRED_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing API key")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="/agent",
    tags=["agent-api"],
    dependencies=[Depends(verify_api_key)],
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class AgentNodeRead(BaseModel):
    id: UUID
    name: str
    container_status: str | None = None
    agent_status: str | None = None
    agent_status_message: str | None = None
    gauge_value: float | None = None
    gauge_label: str | None = None
    gauge_unit: str | None = None
    identity: dict | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class AgentEdgeRead(BaseModel):
    id: UUID
    source_id: UUID
    target_id: UUID
    edge_type: str
    chat_enabled: bool

    model_config = {"from_attributes": True}


class AgentChatRequest(BaseModel):
    message: str
    session_key: str | None = None


class AgentChatResponse(BaseModel):
    node_id: UUID
    node_name: str
    response: str


class AgentNetworkResponse(BaseModel):
    nodes: list[AgentNodeRead]
    edges: list[AgentEdgeRead]
    node_count: int
    edge_count: int


# ---------------------------------------------------------------------------
# Endpoints — Network overview
# ---------------------------------------------------------------------------


@router.get("/network", response_model=AgentNetworkResponse)
async def get_network(db: AsyncSession = Depends(get_db)):
    """Full graph snapshot: all active nodes and all edges in one call."""
    nodes_result = await db.execute(
        select(Node).where(Node.archived == False).order_by(Node.created_at)
    )
    nodes = nodes_result.scalars().all()

    edges_result = await db.execute(select(Edge))
    edges = edges_result.scalars().all()

    return AgentNetworkResponse(
        nodes=[AgentNodeRead.model_validate(n) for n in nodes],
        edges=[AgentEdgeRead.model_validate(e) for e in edges],
        node_count=len(nodes),
        edge_count=len(edges),
    )


# ---------------------------------------------------------------------------
# Endpoints — Nodes
# ---------------------------------------------------------------------------


@router.get("/nodes", response_model=list[AgentNodeRead])
async def list_nodes(db: AsyncSession = Depends(get_db)):
    """List all active (non-archived) nodes."""
    result = await db.execute(
        select(Node).where(Node.archived == False).order_by(Node.created_at)
    )
    return result.scalars().all()


@router.get("/nodes/{node_id}", response_model=AgentNodeRead)
async def get_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a single node by ID."""
    node = await db.get(Node, node_id)
    if not node or node.archived:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.get("/nodes/{node_id}/network")
async def get_node_network(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get network topology (parents, children, siblings) for a node."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return await get_network_topology(node_id, db, include_edge_types=True)


@router.get("/nodes/{node_id}/peers")
async def get_node_peers(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get all chat-enabled reachable peers via BFS traversal."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    peers = await get_chat_peers(node_id, db)
    return {"peers": peers}


@router.get("/nodes/{node_id}/messages", response_model=list[MessageRead])
async def get_node_messages(
    node_id: UUID,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Fetch chat message history for a node, oldest first."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    query = (
        select(ChatMessage)
        .where(ChatMessage.node_id == node_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Endpoints — Edges
# ---------------------------------------------------------------------------


@router.get("/edges", response_model=list[AgentEdgeRead])
async def list_edges(db: AsyncSession = Depends(get_db)):
    """List all edges in the network."""
    result = await db.execute(select(Edge))
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Endpoints — Chat
# ---------------------------------------------------------------------------


@router.post("/nodes/{node_id}/chat", response_model=AgentChatResponse)
async def chat_with_node(node_id: UUID, request: AgentChatRequest):
    """Send a message to a nanobot and return its response (synchronous)."""
    from app.db import async_session

    async with async_session() as db:
        node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    ws_url = _nanobot_ws_url(node)
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Empty message")

    session_key = request.session_key or f"agent:external:{node_id}"

    try:
        async with websockets.connect(ws_url) as ws:
            # Wait for initial ready status
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            status = json.loads(raw)
            if not status.get("ready"):
                raise HTTPException(
                    status_code=503,
                    detail=status.get("message", "Agent not ready"),
                )

            # Send message with network context
            msg = {
                "type": "chat",
                "content": message,
                "session_key": session_key,
            }
            try:
                msg["network"] = await _get_network_context(node_id)
            except Exception:
                logger.debug("Network context unavailable for agent chat on node %s", node_id)
            await ws.send(json.dumps(msg))

            # Store the user message
            async with async_session() as db:
                db.add(ChatMessage(
                    node_id=node_id,
                    role="user",
                    content=message,
                    message_type="agent_api",
                ))
                await db.commit()

            # Wait for response (skip progress/tool_call messages)
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=120)
                reply = json.loads(raw)
                if reply["type"] == "response":
                    response_content = reply["content"]
                    # Store the assistant response
                    async with async_session() as db:
                        db.add(ChatMessage(
                            node_id=node_id,
                            role="assistant",
                            content=response_content,
                            message_type="agent_api",
                        ))
                        await db.commit()
                    return AgentChatResponse(
                        node_id=node_id,
                        node_name=node.name,
                        response=response_content,
                    )
                elif reply["type"] == "error":
                    raise HTTPException(
                        status_code=500,
                        detail=reply.get("message", "Agent error"),
                    )
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Agent response timed out")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cannot connect to nanobot: {exc}")
