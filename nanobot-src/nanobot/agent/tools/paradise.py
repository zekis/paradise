"""Paradise state tool for setting gauge and status without dashboard HTML."""

import json
import os
from typing import Any

import httpx

from nanobot.agent.tools.base import Tool


class ParadiseTool(Tool):
    """Set this node's gauge value or status indicator in Paradise."""

    name = "set_paradise_state"
    description = (
        "Set this node's gauge value and/or status indicator in Paradise. "
        "Use gauge_value (0-100) with optional gauge_label and gauge_unit to display "
        "a progress ring on the node icon. "
        "Use status (ok/warning/error) with optional status_message to set the "
        "status indicator dot."
    )
    parameters = {
        "type": "object",
        "properties": {
            "gauge_value": {
                "type": "number",
                "minimum": 0,
                "maximum": 100,
                "description": "Gauge value from 0 to 100. Displays as a progress ring on the node icon.",
            },
            "gauge_label": {
                "type": "string",
                "description": "Short label for the gauge (e.g. 'cpu', 'tasks').",
            },
            "gauge_unit": {
                "type": "string",
                "description": "Unit for the gauge value (e.g. '%', 'ms').",
            },
            "status": {
                "type": "string",
                "enum": ["ok", "warning", "error"],
                "description": "Status indicator: ok (green), warning (yellow), or error (red).",
            },
            "status_message": {
                "type": "string",
                "description": "Short message describing the current status.",
            },
        },
        "required": [],
    }

    def __init__(self, node_id: str | None = None, backend_url: str | None = None):
        self._node_id = node_id or os.environ.get("PARADISE_NODE_ID", "")
        self._backend_url = backend_url or os.environ.get("PARADISE_BACKEND_URL", "http://backend:8000")

    async def execute(self, **kwargs: Any) -> str:
        if not self._node_id:
            return "Error: PARADISE_NODE_ID not set. Paradise state updates require Paradise context."

        results = []
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Set gauge if gauge_value provided
            if "gauge_value" in kwargs:
                try:
                    r = await client.put(
                        f"{self._backend_url}/api/nodes/{self._node_id}/gauge",
                        json={
                            "value": kwargs["gauge_value"],
                            "label": kwargs.get("gauge_label", ""),
                            "unit": kwargs.get("gauge_unit", ""),
                        },
                    )
                    r.raise_for_status()
                    results.append(f"Gauge set to {kwargs['gauge_value']}")
                except httpx.HTTPStatusError as e:
                    return f"Error setting gauge: HTTP {e.response.status_code} - {e.response.text}"
                except Exception as e:
                    return f"Error setting gauge: {e}"

            # Set status if provided
            if "status" in kwargs:
                try:
                    r = await client.put(
                        f"{self._backend_url}/api/nodes/{self._node_id}/agent-status",
                        json={
                            "status": kwargs["status"],
                            "message": kwargs.get("status_message", ""),
                        },
                    )
                    r.raise_for_status()
                    results.append(f"Status set to {kwargs['status']}")
                except httpx.HTTPStatusError as e:
                    return f"Error setting status: HTTP {e.response.status_code} - {e.response.text}"
                except Exception as e:
                    return f"Error setting status: {e}"

        if not results:
            return "No updates made. Provide gauge_value and/or status."

        return ". ".join(results) + "."
