"""WebSocket chat relay: frontend <-> backend <-> nanobot container."""

import asyncio
import json
from uuid import UUID

import docker
import websockets
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.broadcast import broadcast
from app.db import ChatMessage, Edge, Node, async_session, emit_event, get_db
from app.docker_ops import read_workspace_file, write_workspace_file

DOCKER_CLIENT = docker.from_env()

router = APIRouter(tags=["chat"])


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
                # Sync DB node name back into identity if it has drifted
                if (
                    isinstance(identity, dict)
                    and "name" in identity
                    and identity["name"] != node.name
                ):
                    identity["name"] = node.name
                    try:
                        updated = json.dumps(identity, indent=2)
                        await asyncio.to_thread(
                            write_workspace_file, container_id, "identity.json", updated
                        )
                    except Exception:
                        pass
                node.identity = identity
                await db.commit()

        await emit_event("identity_update", node_id=node_id,
                         node_name=node.name if node else None,
                         summary="Identity updated")

        if websocket is not None:
            try:
                await websocket.send_json({"type": "identity_update", "identity": identity})
            except Exception:
                pass  # Frontend gone; identity is already in DB

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
            pass
    except (json.JSONDecodeError, TypeError):
        pass
    except Exception:
        pass


async def _get_network_context(node_id: UUID) -> dict:
    """Fetch network topology for a node from the database."""
    async with async_session() as db:
        node = await db.get(Node, node_id)
        if not node:
            return {}

        edges_out = (await db.execute(
            select(Edge).where(Edge.source_id == node_id)
        )).scalars().all()
        edges_in = (await db.execute(
            select(Edge).where(Edge.target_id == node_id)
        )).scalars().all()

        child_ids = [e.target_id for e in edges_out]
        parent_ids = [e.source_id for e in edges_in]

        sibling_ids: set = set()
        if parent_ids:
            sibling_edges = (await db.execute(
                select(Edge).where(
                    Edge.source_id.in_(parent_ids),
                    Edge.target_id != node_id,
                )
            )).scalars().all()
            sibling_ids = {e.target_id for e in sibling_edges}

        all_ids = set(child_ids) | set(parent_ids) | sibling_ids
        related: dict = {}
        if all_ids:
            result = await db.execute(select(Node).where(Node.id.in_(all_ids)))
            related = {n.id: n for n in result.scalars().all()}

        def _summary(n: Node) -> dict:
            return {
                "id": str(n.id),
                "name": n.name,
                "identity": n.identity,
                "agent_status": n.agent_status,
                "agent_status_message": n.agent_status_message,
            }

        return {
            "self": _summary(node),
            "parents": [_summary(related[p]) for p in parent_ids if p in related],
            "children": [_summary(related[c]) for c in child_ids if c in related],
            "siblings": [_summary(related[s]) for s in sibling_ids if s in related],
        }


@router.websocket("/nodes/{node_id}/chat")
async def chat_relay(websocket: WebSocket, node_id: UUID):
    """Relay chat messages between the frontend and a nanobot container.

    The nanobot receive loop is decoupled from the frontend send — if the
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
                        try:
                            parsed = json.loads(data)
                            if parsed.get("type") == "chat" and parsed.get("content"):
                                async with async_session() as db:
                                    db.add(ChatMessage(
                                        node_id=node_id,
                                        role="user",
                                        content=parsed["content"],
                                        message_type=parsed.get("message_type", "chat"),
                                        display_content=parsed.get("display_content"),
                                    ))
                                    await db.commit()
                                # Inject network context into message for the nanobot
                                try:
                                    network = await _get_network_context(node_id)
                                    parsed["network"] = network
                                    data = json.dumps(parsed)
                                except Exception:
                                    pass  # Don't block chat if network fetch fails
                        except Exception:
                            pass
                        await nanobot_ws.send(data)
                except WebSocketDisconnect:
                    frontend_connected = False

            async def nanobot_to_frontend():
                nonlocal frontend_connected
                try:
                    async for msg in nanobot_ws:
                        # Always store responses in DB, regardless of frontend
                        try:
                            parsed = json.loads(msg)
                            msg_type = parsed.get("type")
                            if msg_type == "response" and parsed.get("content"):
                                async with async_session() as db:
                                    db.add(ChatMessage(node_id=node_id, role="assistant", content=parsed["content"]))
                                    await db.commit()
                                content_preview = parsed["content"][:80]
                                if len(parsed["content"]) > 80:
                                    content_preview += "..."
                                await emit_event("chat_response", node_id=node_id, node_name=node_name,
                                                 summary=content_preview)
                                await _check_identity(
                                    node_id, container_id,
                                    websocket if frontend_connected else None,
                                )
                            elif msg_type == "tool_call" and parsed.get("content"):
                                async with async_session() as db:
                                    db.add(ChatMessage(
                                        node_id=node_id, role="assistant",
                                        content=parsed["content"], message_type="tool_call",
                                    ))
                                    await db.commit()
                                tool_preview = parsed["content"][:80]
                                if len(parsed["content"]) > 80:
                                    tool_preview += "..."
                                await emit_event("chat_tool_call", node_id=node_id, node_name=node_name,
                                                 summary=tool_preview)
                            elif msg_type == "error" and parsed.get("message"):
                                error_msg = parsed["message"]
                                is_connect_error = any(
                                    p in error_msg.lower()
                                    for p in ("cannot connect", "connection refused", "name resolution")
                                )
                                if not is_connect_error:
                                    async with async_session() as db:
                                        db.add(ChatMessage(
                                            node_id=node_id, role="assistant",
                                            content=f"Error: {error_msg}",
                                            message_type="error",
                                        ))
                                        await db.commit()
                                    await emit_event("chat_error", node_id=node_id, node_name=node_name,
                                                     summary=error_msg[:120])
                        except Exception:
                            pass

                        # Forward to frontend only if still connected
                        if frontend_connected:
                            try:
                                await websocket.send_text(msg)
                            except Exception:
                                frontend_connected = False
                except websockets.exceptions.ConnectionClosed:
                    pass

            frontend_task = asyncio.create_task(frontend_to_nanobot())
            nanobot_task = asyncio.create_task(nanobot_to_frontend())

            done, pending = await asyncio.wait(
                [frontend_task, nanobot_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            if frontend_task in done and nanobot_task in pending:
                # Frontend disconnected — keep draining nanobot messages
                await nanobot_task
            elif nanobot_task in done and frontend_task in pending:
                # Nanobot finished — stop listening to frontend
                frontend_task.cancel()
                try:
                    await frontend_task
                except asyncio.CancelledError:
                    pass

    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": f"Cannot connect to nanobot: {exc}"})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@router.post("/nodes/{node_id}/exec")
async def exec_command(node_id: UUID, payload: dict):
    """Send a message to a nanobot agent and return the response (sync REST wrapper)."""
    async with async_session() as db:
        node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    ws_url = _nanobot_ws_url(node)
    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")

    session_key = payload.get("session_key", f"paradise:exec:{node_id}")

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
                pass
            await ws.send(json.dumps(msg))

            # Wait for response (skip progress messages)
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=120)
                msg = json.loads(raw)
                if msg["type"] == "response":
                    return {"response": msg["content"]}
                elif msg["type"] == "error":
                    raise HTTPException(status_code=500, detail=msg.get("message", "Agent error"))
                # Skip progress messages
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Agent response timed out")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cannot connect to nanobot: {exc}")


@router.post("/nodes/{node_id}/run")
async def run_command(node_id: UUID, payload: dict):
    """Run a command directly inside a nanobot container (no LLM). Returns stdout."""
    async with async_session() as db:
        node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    command = payload.get("command", "").strip()
    if not command:
        raise HTTPException(status_code=400, detail="Empty command")

    try:
        container = DOCKER_CLIENT.containers.get(node.container_id)
        exit_code, output = container.exec_run(
            ["bash", "-c", command],
            workdir="/root/.nanobot/workspace",
            environment={"PYTHONDONTWRITEBYTECODE": "1"},
        )
        stdout = output.decode("utf-8", errors="replace")
        return {"exit_code": exit_code, "output": stdout}
    except docker.errors.NotFound:
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
    created_at: str | None

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
