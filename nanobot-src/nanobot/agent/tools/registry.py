"""Tool registry for dynamic tool management.

Tools use a **return-based** error convention: expected errors are returned
as strings starting with ``"Error: "``.  The registry adds a safety net
that catches unexpected exceptions so the agent loop never crashes.  See
``Tool`` base class docstring for the full convention.
"""

import logging
from typing import Any

from nanobot.agent.tools.base import Tool

logger = logging.getLogger(__name__)


class ToolRegistry:
    """
    Registry for agent tools.

    Allows dynamic registration and execution of tools.
    """

    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """Register a tool."""
        self._tools[tool.name] = tool

    def unregister(self, name: str) -> None:
        """Unregister a tool by name."""
        self._tools.pop(name, None)

    def get(self, name: str) -> Tool | None:
        """Get a tool by name."""
        return self._tools.get(name)

    def has(self, name: str) -> bool:
        """Check if a tool is registered."""
        return name in self._tools

    def get_definitions(self) -> list[dict[str, Any]]:
        """Get all tool definitions in OpenAI format."""
        return [tool.to_schema() for tool in self._tools.values()]

    async def execute(self, name: str, params: dict[str, Any]) -> str:
        """Execute a tool by name with given parameters.

        Error handling has two layers:

        1. **Expected errors**: tools return ``"Error: ..."`` strings.  The
           registry detects these (via the ``"Error"`` prefix) and appends a
           retry hint for the LLM.
        2. **Unexpected exceptions**: caught here as a safety net so the
           agent loop never crashes.  These are logged at WARNING level for
           operator visibility.
        """
        _HINT = "\n\n[Analyze the error above and try a different approach.]"

        tool = self._tools.get(name)
        if not tool:
            return f"Error: Tool '{name}' not found. Available: {', '.join(self.tool_names)}"

        try:
            errors = tool.validate_params(params)
            if errors:
                return f"Error: Invalid parameters for tool '{name}': " + "; ".join(errors) + _HINT
            result = await tool.execute(**params)
            if isinstance(result, str) and result.startswith("Error"):
                return result + _HINT
            return result
        except Exception as e:
            # Safety net for unexpected exceptions -- log so operators can
            # diagnose bugs in tool implementations.
            logger.warning("Unexpected exception in tool '%s': %s", name, e, exc_info=True)
            return f"Error executing {name}: {e}" + _HINT
    
    @property
    def tool_names(self) -> list[str]:
        """Get list of registered tool names."""
        return list(self._tools.keys())
    
    def __len__(self) -> int:
        return len(self._tools)
    
    def __contains__(self, name: str) -> bool:
        return name in self._tools
