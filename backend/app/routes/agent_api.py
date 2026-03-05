"""External Agent API — clean programmatic access to the Paradise nanobot network."""

import asyncio
import json
import logging
import os
from datetime import datetime
from uuid import UUID, uuid4

import websockets
from fastapi import APIRouter, Depends, HTTPException, Query, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.broadcast import broadcast
from app.db import ChatMessage, Edge, Node, emit_event, get_db
from app.docker_ops import read_workspace_file
from app.routes.chat import MessageRead, _get_network_context, _nanobot_ws_url
from app.routes.helpers import get_chat_peers, get_network_topology, setup_container

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


class AgentNodeCreate(BaseModel):
    name: str = "new-nanobot"
    genesis_prompt: str | None = None
    parent_id: UUID | None = None


class AgentNodeCreateResponse(BaseModel):
    node: AgentNodeRead
    edge_id: UUID | None = None
    genesis_response: str | None = None


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


@router.post("/nodes", response_model=AgentNodeCreateResponse)
async def create_node(payload: AgentNodeCreate, db: AsyncSession = Depends(get_db)):
    """Create a new nanobot node.

    Optionally attach it to a parent (creates an edge) and/or run genesis
    by providing a genesis_prompt (blocks until the nanobot responds).
    """
    from app.db import async_session

    # Validate parent if specified
    parent = None
    if payload.parent_id:
        parent = await db.get(Node, payload.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent node not found")

    # Create the node
    node_id = uuid4()
    node = Node(id=node_id, name=payload.name)

    try:
        await setup_container(node, db)
    except Exception as exc:
        node.container_status = "error"
        node.config = {"error": str(exc)}

    db.add(node)

    # Create parent -> child edge if parent specified
    edge_id = None
    if parent:
        edge = Edge(
            id=uuid4(),
            source_id=parent.id,
            target_id=node_id,
            edge_type="connection",
            source_handle="bottom-s",
            target_handle="top-t",
        )
        db.add(edge)
        edge_id = edge.id

    await db.commit()
    await db.refresh(node)

    await emit_event(
        "node_created",
        node_id=node.id,
        node_name=node.name,
        summary=f'Node "{node.name}" created via agent API'
        + (f' as child of "{parent.name}"' if parent else ""),
    )

    # Run genesis if prompt provided and container is healthy
    genesis_response = None
    if payload.genesis_prompt and node.container_id:
        # Enrich with parent context
        prompt = payload.genesis_prompt
        if parent:
            parts = [prompt, "\n\n## Parent Context", f"Parent node: {parent.name}"]
            if parent.identity:
                parts.append(f"Parent identity: {json.dumps(parent.identity)}")
            if parent.container_id:
                try:
                    settings = await asyncio.to_thread(
                        read_workspace_file, parent.container_id, "settings.json"
                    )
                    if settings:
                        parts.append(f"Parent settings: {settings}")
                except Exception:
                    pass
            prompt = "\n".join(parts)

        # Send to nanobot via WebSocket exec flow
        ws_url = _nanobot_ws_url(node)
        try:
            async with websockets.connect(ws_url) as ws:
                raw = await asyncio.wait_for(ws.recv(), timeout=10)
                status = json.loads(raw)
                if not status.get("ready"):
                    logger.warning("Nanobot not ready for genesis on node %s", node_id)
                else:
                    msg = {
                        "type": "chat",
                        "content": prompt,
                        "session_key": f"agent:genesis:{node_id}",
                    }
                    try:
                        msg["network"] = await _get_network_context(node_id)
                    except Exception:
                        pass
                    await ws.send(json.dumps(msg))

                    # Store the genesis message
                    async with async_session() as store_db:
                        store_db.add(ChatMessage(
                            node_id=node_id,
                            role="user",
                            content=prompt,
                            message_type="agent_api",
                            display_content=f"Genesis: {payload.genesis_prompt[:80]}",
                        ))
                        await store_db.commit()
                    await broadcast.publish("chat_message_added", {"node_id": str(node_id)})

                    # Wait for response
                    while True:
                        raw = await asyncio.wait_for(ws.recv(), timeout=120)
                        reply = json.loads(raw)
                        if reply["type"] == "response":
                            genesis_response = reply["content"]
                            async with async_session() as store_db:
                                store_db.add(ChatMessage(
                                    node_id=node_id,
                                    role="assistant",
                                    content=genesis_response,
                                    message_type="agent_api",
                                ))
                                await store_db.commit()
                            await broadcast.publish("chat_message_added", {"node_id": str(node_id)})
                            break
                        elif reply["type"] == "error":
                            logger.warning(
                                "Genesis error for node %s: %s",
                                node_id, reply.get("message"),
                            )
                            break
        except asyncio.TimeoutError:
            logger.warning("Genesis timed out for node %s", node_id)
        except Exception as exc:
            logger.warning("Genesis failed for node %s: %s", node_id, exc)

    return AgentNodeCreateResponse(
        node=AgentNodeRead.model_validate(node),
        edge_id=edge_id,
        genesis_response=genesis_response,
    )


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
            await broadcast.publish("chat_message_added", {"node_id": str(node_id)})

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
                    await broadcast.publish("chat_message_added", {"node_id": str(node_id)})
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
