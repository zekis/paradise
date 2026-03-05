"""Peer chat tool for sending messages to other nanobots in Paradise."""

import json
import os
from typing import Any

import httpx

from nanobot.agent.tools.base import Tool


class PeerChatTool(Tool):
    """Send messages to peer nanobots via chat-enabled connections."""

    name = "send_to_peer"
    description = (
        "Communicate with peer nanobots connected via chat-enabled edges. "
        "Use action='list' to discover which peers you can message. "
        "Use action='send' with a peer_id and message to send a message "
        "and receive their response."
    )
    parameters = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["list", "send"],
                "description": "Action to perform: 'list' to discover chat peers, 'send' to message a peer.",
            },
            "peer_id": {
                "type": "string",
                "description": "The target peer node ID (required when action='send').",
            },
            "message": {
                "type": "string",
                "description": "The message to send to the peer (required when action='send').",
            },
        },
        "required": ["action"],
    }

    def __init__(self, node_id: str | None = None, backend_url: str | None = None):
        self._node_id = node_id or os.environ.get("PARADISE_NODE_ID", "")
        self._backend_url = backend_url or os.environ.get("PARADISE_BACKEND_URL", "http://backend:8000")

    async def execute(self, action: str = "list", peer_id: str | None = None, message: str | None = None, **kwargs: Any) -> str:
        if not self._node_id:
            return "Error: PARADISE_NODE_ID not set. Peer chat requires Paradise context."

        try:
            async with httpx.AsyncClient(timeout=130.0) as client:
                if action == "list":
                    url = f"{self._backend_url}/api/nodes/{self._node_id}/chat-peers"
                    r = await client.get(url)
                    r.raise_for_status()
                    return json.dumps(r.json(), indent=2)

                elif action == "send":
                    if not peer_id:
                        return "Error: peer_id is required when action='send'."
                    if not message:
                        return "Error: message is required when action='send'."

                    url = f"{self._backend_url}/api/nodes/{self._node_id}/peer-message"
                    r = await client.post(url, json={
                        "target_node_id": peer_id,
                        "content": message,
                    })
                    r.raise_for_status()
                    return json.dumps(r.json(), indent=2)

                else:
                    return f"Error: Unknown action '{action}'. Use 'list' or 'send'."

        except httpx.HTTPStatusError as e:
            return f"Error: HTTP {e.response.status_code} - {e.response.text}"
        except Exception as e:
            return f"Error communicating with peer: {e}"
