"""WebSocket chat relay: frontend <-> backend <-> nanobot container."""

import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Node, async_session

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
        import websockets
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
