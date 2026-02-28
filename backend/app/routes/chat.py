"""WebSocket chat relay: frontend <-> backend <-> nanobot container."""

import asyncio
import json
from uuid import UUID

import docker
import websockets
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Node, async_session

DOCKER_CLIENT = docker.from_env()

router = APIRouter(tags=["chat"])

# Map node_id -> container name for WebSocket relay
def _nanobot_ws_url(node: Node) -> str:
    """Build the WebSocket URL for a nanobot container."""
    container_name = f"nanobot-{str(node.id)[:8]}"
    port = 18790
    return f"ws://{container_name}:{port}"


@router.websocket("/nodes/{node_id}/chat")
async def chat_relay(websocket: WebSocket, node_id: UUID):
    """Relay chat messages between the frontend and a nanobot container."""
    await websocket.accept()

    # Look up the node
    async with async_session() as db:
        node = await db.get(Node, node_id)
        if not node or not node.container_id:
            await websocket.send_json({"type": "error", "message": "Node not found or no container"})
            await websocket.close()
            return

    ws_url = _nanobot_ws_url(node)

    try:
        async with websockets.connect(ws_url) as nanobot_ws:
            # Two concurrent tasks: forward in each direction
            async def frontend_to_nanobot():
                try:
                    while True:
                        data = await websocket.receive_text()
                        await nanobot_ws.send(data)
                except WebSocketDisconnect:
                    pass

            async def nanobot_to_frontend():
                try:
                    async for msg in nanobot_ws:
                        await websocket.send_text(msg)
                except Exception:
                    pass

            await asyncio.gather(
                frontend_to_nanobot(),
                nanobot_to_frontend(),
            )
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

            # Send command
            await ws.send(json.dumps({
                "type": "chat",
                "content": content,
                "session_key": session_key,
            }))

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
