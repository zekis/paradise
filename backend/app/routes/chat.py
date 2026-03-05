"""WebSocket chat relay: frontend <-> backend <-> nanobot container."""

import asyncio
import json
import logging
from datetime import datetime
from uuid import UUID

import websockets
from docker.errors import NotFound as ContainerNotFound
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.broadcast import broadcast
from app.db import ChatMessage, Node, async_session, emit_event, get_db
from app.docker_ops import read_workspace_file, run_container_command
from app.routes.helpers import get_chat_peers, get_network_topology, sync_identity_name

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


class ExecRequest(BaseModel):
    content: str
    session_key: str | None = None


class RunCommandRequest(BaseModel):
    command: str


def _nanobot_ws_url(node: Node) -> str:
    """Build the WebSocket URL for a nanobot container."""
    container_name = f"nanobot-{str(node.id)[:8]}"
    port = 18790
    return f"ws://{container_name}:{port}"


async def _check_identity(
    node_id: UUID,
    container_id: str,
    websocket: WebSocket | None,
) -> None:
    """Read identity.json from container, update DB, notify frontend if connected."""
    try:
        content = await asyncio.to_thread(read_workspace_file, container_id, "identity.json")
        if not content:
            return

        identity = json.loads(content)

        async with async_session() as db:
            node = await db.get(Node, node_id)
            if node:
                identity = await sync_identity_name(container_id, node.name, identity)
                node.identity = identity
                await db.commit()

        await emit_event("identity_update", node_id=node_id,
                         node_name=node.name if node else None,
                         summary="Identity updated")

        if websocket is not None:
            try:
                await websocket.send_json({"type": "identity_update", "identity": identity})
            except Exception:
                logger.debug("Frontend disconnected before identity update for node %s", node_id)

        # Check for recommendations.json and notify
        try:
            recs_content = await asyncio.to_thread(
                read_workspace_file, container_id, "recommendations.json"
            )
            if recs_content:
                recs_data = json.loads(recs_content)
                recs = recs_data if isinstance(recs_data, list) else recs_data.get("recommendations", [])
                if recs:
                    await broadcast.publish("recommendations_ready", {
                        "node_id": str(node_id),
                    })
        except Exception:
            logger.debug("Failed to read recommendations.json for node %s", node_id)
    except (json.JSONDecodeError, TypeError):
        logger.debug("Malformed identity.json for node %s", node_id)
    except Exception:
        logger.warning("Unexpected error checking identity for node %s", node_id, exc_info=True)


async def _get_network_context(node_id: UUID) -> dict:
    """Fetch network topology for a node from the database."""
    async with async_session() as db:
        return await get_network_topology(node_id, db)


def _truncate(text: str, limit: int = 80) -> str:
    """Return *text* truncated to *limit* chars with an ellipsis suffix."""
    return text[:limit] + "..." if len(text) > limit else text


async def _store_user_message(node_id: UUID, parsed: dict) -> None:
    """Persist an inbound user chat message to the database."""
    async with async_session() as db:
        db.add(ChatMessage(
            node_id=node_id,
            role="user",
            content=parsed["content"],
            message_type=parsed.get("message_type", "chat"),
            display_content=parsed.get("display_content"),
        ))
        await db.commit()


async def _store_response(node_id: UUID, node_name: str, content: str) -> None:
    """Persist an assistant response and emit a chat_response event."""
    async with async_session() as db:
        db.add(ChatMessage(node_id=node_id, role="assistant", content=content))
        await db.commit()
    await emit_event("chat_response", node_id=node_id, node_name=node_name,
                     summary=_truncate(content))


async def _store_tool_call(node_id: UUID, node_name: str, content: str) -> None:
    """Persist a tool-call message and emit a chat_tool_call event."""
    async with async_session() as db:
        db.add(ChatMessage(
            node_id=node_id, role="assistant",
            content=content, message_type="tool_call",
        ))
        await db.commit()
    await emit_event("chat_tool_call", node_id=node_id, node_name=node_name,
                     summary=_truncate(content))


_CONNECT_ERROR_PHRASES = ("cannot connect", "connection refused", "name resolution")


async def _store_error(node_id: UUID, node_name: str, error_msg: str) -> None:
    """Persist a non-transient error message and emit a chat_error event."""
    if any(p in error_msg.lower() for p in _CONNECT_ERROR_PHRASES):
        return
    async with async_session() as db:
        db.add(ChatMessage(
            node_id=node_id, role="assistant",
            content=f"Error: {error_msg}",
            message_type="error",
        ))
        await db.commit()
    await emit_event("chat_error", node_id=node_id, node_name=node_name,
                     summary=_truncate(error_msg, 120))


async def _handle_nanobot_message(
    parsed: dict,
    node_id: UUID,
    node_name: str,
    container_id: str,
    websocket: WebSocket | None,
) -> None:
    """Route a single parsed nanobot message to the correct handler."""
    msg_type = parsed.get("type")
    if msg_type == "response" and parsed.get("content"):
        await _store_response(node_id, node_name, parsed["content"])
        await _check_identity(node_id, container_id, websocket)
    elif msg_type == "tool_call" and parsed.get("content"):
        await _store_tool_call(node_id, node_name, parsed["content"])
    elif msg_type == "error" and parsed.get("message"):
        await _store_error(node_id, node_name, parsed["message"])


async def _enrich_and_forward(
    data: str,
    node_id: UUID,
    nanobot_ws,
) -> str:
    """Parse an inbound chat frame, store it, attach network context, and forward."""
    try:
        parsed = json.loads(data)
    except Exception:
        logger.debug("Failed to parse inbound chat message for node %s", node_id)
        await nanobot_ws.send(data)
        return data

    if parsed.get("type") == "chat" and parsed.get("content"):
        await _store_user_message(node_id, parsed)
        try:
            parsed["network"] = await _get_network_context(node_id)
            data = json.dumps(parsed)
        except Exception:
            logger.debug("Network context fetch failed for node %s", node_id)

    await nanobot_ws.send(data)
    return data


async def _relay_nanobot_frame(
    msg: str,
    node_id: UUID,
    node_name: str,
    container_id: str,
    websocket: WebSocket | None,
) -> bool:
    """Process one nanobot frame: persist, forward to frontend. Returns False if frontend died."""
    try:
        parsed = json.loads(msg)
        await _handle_nanobot_message(parsed, node_id, node_name, container_id, websocket)
    except Exception:
        logger.debug("Failed to process nanobot message for node %s", node_id)

    if websocket is None:
        return True  # already disconnected, nothing to forward
    try:
        await websocket.send_text(msg)
    except Exception:
        logger.debug("Frontend send failed for node %s, marking disconnected", node_id)
        return False
    return True


async def _await_remaining_task(
    frontend_task: asyncio.Task,
    nanobot_task: asyncio.Task,
    done: set[asyncio.Task],
    pending: set[asyncio.Task],
) -> None:
    """After one relay direction finishes, drain or cancel the other."""
    if frontend_task in done and nanobot_task in pending:
        await nanobot_task
        return
    if nanobot_task in done and frontend_task in pending:
        frontend_task.cancel()
        try:
            await frontend_task
        except asyncio.CancelledError:
            pass


@router.websocket("/nodes/{node_id}/chat")
async def chat_relay(websocket: WebSocket, node_id: UUID):
    """Relay chat messages between the frontend and a nanobot container.

    The nanobot receive loop is decoupled from the frontend send -- if the
    frontend disconnects, the relay keeps draining nanobot messages and
    storing them in the DB.  Identity detection happens server-side after
    each response message.
    """
    await websocket.accept()

    async with async_session() as db:
        node = await db.get(Node, node_id)
        if not node or not node.container_id:
            await websocket.send_json({"type": "error", "message": "Node not found or no container"})
            await websocket.close()
            return

    ws_url = _nanobot_ws_url(node)
    container_id = node.container_id
    node_name = node.name

    try:
        async with websockets.connect(ws_url) as nanobot_ws:
            frontend_connected = True

            async def frontend_to_nanobot():
                nonlocal frontend_connected
                try:
                    while True:
                        data = await websocket.receive_text()
                        await _enrich_and_forward(data, node_id, nanobot_ws)
                except WebSocketDisconnect:
                    frontend_connected = False

            async def nanobot_to_frontend():
                nonlocal frontend_connected
                try:
                    async for msg in nanobot_ws:
                        ws = websocket if frontend_connected else None
                        ok = await _relay_nanobot_frame(msg, node_id, node_name, container_id, ws)
                        if not ok:
                            frontend_connected = False
                except websockets.exceptions.ConnectionClosed:
                    logger.debug("Nanobot WebSocket closed for node %s", node_id)

            frontend_task = asyncio.create_task(frontend_to_nanobot())
            nanobot_task = asyncio.create_task(nanobot_to_frontend())

            done, pending = await asyncio.wait(
                [frontend_task, nanobot_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            await _await_remaining_task(frontend_task, nanobot_task, done, pending)

    except Exception as exc:
        logger.warning("Chat relay error for node %s: %s", node_id, exc)
        try:
            await websocket.send_json({"type": "error", "message": f"Cannot connect to nanobot: {exc}"})
        except Exception:
            logger.debug("Failed to send error to frontend for node %s", node_id)
    finally:
        try:
            await websocket.close()
        except Exception:
            logger.debug("WebSocket already closed for node %s", node_id)


@router.post("/nodes/{node_id}/exec")
async def exec_command(node_id: UUID, request: ExecRequest):
    """Send a message to a nanobot agent and return the response (sync REST wrapper)."""
    async with async_session() as db:
        node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    ws_url = _nanobot_ws_url(node)
    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")

    session_key = request.session_key or f"paradise:exec:{node_id}"

    try:
        async with websockets.connect(ws_url) as ws:
            # Wait for initial status
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            status = json.loads(raw)
            if not status.get("ready"):
                raise HTTPException(status_code=503, detail=status.get("message", "Agent not ready"))

            # Send command with network context
            msg = {
                "type": "chat",
                "content": content,
                "session_key": session_key,
            }
            try:
                msg["network"] = await _get_network_context(node_id)
            except Exception:
                logger.debug("Network context unavailable for exec on node %s", node_id)
            await ws.send(json.dumps(msg))

            # Wait for response (skip progress messages)
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=120)
                reply = json.loads(raw)
                if reply["type"] == "response":
                    return {"response": reply["content"]}
                elif reply["type"] == "error":
                    raise HTTPException(status_code=500, detail=reply.get("message", "Agent error"))
                # Skip progress messages
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Agent response timed out")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cannot connect to nanobot: {exc}")


class PeerMessageRequest(BaseModel):
    target_node_id: UUID
    content: str


@router.post("/nodes/{node_id}/peer-message")
async def send_peer_message(node_id: UUID, request: PeerMessageRequest):
    """Send a message from one nanobot to another via a chat-enabled edge path."""
    async with async_session() as db:
        sender = await db.get(Node, node_id)
        if not sender or not sender.container_id:
            raise HTTPException(status_code=404, detail="Sender node or container not found")

        target = await db.get(Node, request.target_node_id)
        if not target or not target.container_id:
            raise HTTPException(status_code=404, detail="Target node or container not found")

        # Verify chat-enabled path exists
        peers = await get_chat_peers(node_id, db)
        peer_ids = {p["id"] for p in peers}
        if str(request.target_node_id) not in peer_ids:
            raise HTTPException(status_code=403, detail="No chat-enabled path to target node")

    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")

    sender_label = f"{sender.name} (id: {str(sender.id)[:8]})"
    target_label = f"{target.name} (id: {str(target.id)[:8]})"

    # Store outbound on sender's chat log
    async with async_session() as db:
        db.add(ChatMessage(
            node_id=node_id,
            role="user",
            content=content,
            message_type="peer_out",
            display_content=f"To {target_label}: {_truncate(content)}",
        ))
        await db.commit()

    # Deliver to target nanobot
    ws_url = _nanobot_ws_url(target)
    prefixed = f"[Message from peer node '{sender.name}' (id: {str(sender.id)[:8]})]:\n{content}"

    try:
        async with websockets.connect(ws_url) as ws:
            # Wait for initial status
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            status = json.loads(raw)
            if not status.get("ready"):
                raise HTTPException(status_code=503, detail=status.get("message", "Target agent not ready"))

            # Build message with sender's network context
            msg = {
                "type": "chat",
                "content": prefixed,
                "session_key": f"paradise:peer:{sender.id}",
            }
            try:
                async with async_session() as db:
                    msg["network"] = await get_network_topology(request.target_node_id, db)
            except Exception:
                logger.debug("Network context unavailable for peer message to node %s", request.target_node_id)
            await ws.send(json.dumps(msg))

            # Store inbound on target's chat log
            async with async_session() as db:
                db.add(ChatMessage(
                    node_id=request.target_node_id,
                    role="user",
                    content=prefixed,
                    message_type="peer_in",
                    display_content=f"From {sender_label}: {_truncate(content)}",
                ))
                await db.commit()

            # Wait for response (skip progress messages)
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=120)
                reply = json.loads(raw)
                if reply["type"] == "response":
                    response_content = reply["content"]
                    # Store response on target's chat log
                    async with async_session() as db:
                        db.add(ChatMessage(
                            node_id=request.target_node_id,
                            role="assistant",
                            content=response_content,
                            message_type="peer_response",
                        ))
                        await db.commit()
                    await emit_event("peer_message", node_id=node_id, node_name=sender.name,
                                     summary=f"{sender.name} -> {target.name}: {_truncate(content)}")
                    return {"response": response_content, "from_node": target.name}
                elif reply["type"] == "error":
                    raise HTTPException(status_code=500, detail=reply.get("message", "Target agent error"))
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Target agent response timed out")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cannot connect to target nanobot: {exc}")


@router.post("/nodes/{node_id}/run")
async def run_command(node_id: UUID, request: RunCommandRequest):
    """Run a command directly inside a nanobot container (no LLM). Returns stdout."""
    async with async_session() as db:
        node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    command = request.command.strip()
    if not command:
        raise HTTPException(status_code=400, detail="Empty command")

    try:
        exit_code, stdout = run_container_command(node.container_id, command)
        return {"exit_code": exit_code, "output": stdout}
    except ContainerNotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class MessageRead(BaseModel):
    id: UUID
    node_id: UUID
    role: str
    content: str
    message_type: str | None = None
    display_content: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


@router.get("/nodes/{node_id}/messages", response_model=list[MessageRead])
async def get_messages(
    node_id: UUID,
    limit: int = Query(default=100, le=500),
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
