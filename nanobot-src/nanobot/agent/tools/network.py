"""Network awareness tool for querying peer nodes in Paradise."""

import json
import os
from typing import Any

import httpx

from nanobot.agent.tools.base import Tool


class NetworkTool(Tool):
    """Query the Paradise network to discover connected nodes and fetch peer configs."""

    name = "get_network"
    description = (
        "Query the Paradise network to see connected nodes (parents, children, siblings) "
        "and optionally fetch a peer's config and workspace files. "
        "Call without arguments to get the network topology. "
        "Pass a peer_id to get that peer's detailed config."
    )
    parameters = {
        "type": "object",
        "properties": {
            "peer_id": {
                "type": "string",
                "description": (
                    "Optional: a specific peer node ID to get detailed config from. "
                    "If omitted, returns the overall network topology."
                ),
            },
        },
        "required": [],
    }

    def __init__(self, node_id: str | None = None, backend_url: str | None = None):
        self._node_id = node_id or os.environ.get("PARADISE_NODE_ID", "")
        self._backend_url = backend_url or os.environ.get("PARADISE_BACKEND_URL", "http://backend:8000")

    async def execute(self, peer_id: str | None = None, **kwargs: Any) -> str:
        if not self._node_id:
            return "Error: PARADISE_NODE_ID not set. Network queries require Paradise context."

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                if peer_id:
                    url = f"{self._backend_url}/api/nodes/{self._node_id}/network/config/{peer_id}"
                else:
                    url = f"{self._backend_url}/api/nodes/{self._node_id}/network"
                r = await client.get(url)
                r.raise_for_status()
                return json.dumps(r.json(), indent=2)
        except httpx.HTTPStatusError as e:
            return f"Error querying network: HTTP {e.response.status_code} - {e.response.text}"
        except Exception as e:
            return f"Error querying network: {e}"
