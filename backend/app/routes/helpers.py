"""Shared helpers for route modules."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select

from app.db import CanvasState, Edge, Node
from app.docker_ops import (
    create_nanobot_container,
    write_nanobot_config,
    write_workspace_file,
    write_workspace_files_batch,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Allowed workspace files & default templates
# ---------------------------------------------------------------------------

ALLOWED_WORKSPACE_FILES = {
    "SOUL.md", "AGENTS.md", "USER.md", "HEARTBEAT.md", "TOOLS.md", "identity.json",
    "dashboard.html", "config.html", "commands.html", "children.html",
    "settings.json", "api.py", "recommendations.json", "status_update.py",
}

DEFAULT_TEMPLATES: dict[str, str] = {
    "SOUL.md": """# Soul

I am nanobot, a personal AI assistant.

## Personality

- Helpful and friendly
- Concise and to the point
- Curious and eager to learn

## Values

- Accuracy over speed
- User privacy and safety
- Transparency in actions

## Communication Style

- Be clear and direct
- Explain reasoning when helpful
- Ask clarifying questions when needed
""",
    "AGENTS.md": """# Agent Instructions

You are a helpful AI assistant. Be concise, accurate, and friendly.

## Scheduled Reminders

When user asks for a reminder at a specific time, use `exec` to run:
```
nanobot cron add --name "reminder" --message "Your message" --at "YYYY-MM-DDTHH:MM:SS" --deliver --to "USER_ID" --channel "CHANNEL"
```
Get USER_ID and CHANNEL from the current session.

**Do NOT just write reminders to MEMORY.md** \u2014 that won't trigger actual notifications.

## Heartbeat Tasks

`HEARTBEAT.md` is checked every 30 minutes. Use file tools to manage periodic tasks:

- **Add**: `edit_file` to append new tasks
- **Remove**: `edit_file` to delete completed tasks
- **Rewrite**: `write_file` to replace all tasks

When the user asks for a recurring/periodic task, update `HEARTBEAT.md` instead of creating a one-time cron reminder.

## Automatic Status Updates

A `status_update.py` script in your workspace runs every 30 seconds via cron \u2014 **no LLM invocation**.
Customize it during genesis to monitor whatever matters for your node (CPU, API health, task count, etc.).

Output format (JSON to stdout, all fields optional):
```json
{"gauge_value": 73, "gauge_label": "cpu", "gauge_unit": "%", "status": "ok", "status_message": "All nominal"}
```

Manage the cron job via the cron tool:
- Change interval: remove and re-add with different `every_seconds`
- Change script: create a new exec cron with `exec_command`
- Disable: `cron remove <job_id>`

## Child Node Recommendations

Write a `recommendations.json` file to suggest child nanobot nodes. Each recommendation appears as a "Create" button in your node's Children tab. When clicked, the system creates a child node connected to you and runs genesis with your context included.

Use shell commands or api.py to discover real services (VMs, containers, databases, etc.) before recommending. Include connection details in each `genesis_prompt` so the child can connect without re-asking the user.

See `/root/docs/PARADISE_API.md` for the full format and field reference.
""",
    "USER.md": """# User Profile

Information about the user to help personalize interactions.

## Basic Information

- **Name**: (your name)
- **Timezone**: (your timezone, e.g., UTC+8)
- **Language**: (preferred language)

## Preferences

### Communication Style

- [ ] Casual
- [ ] Professional
- [ ] Technical

### Response Length

- [ ] Brief and concise
- [ ] Detailed explanations
- [ ] Adaptive based on question

## Work Context

- **Primary Role**: (your role)
- **Main Projects**: (what you're working on)
- **Tools You Use**: (IDEs, languages, frameworks)

## Special Instructions

(Any specific instructions for how the assistant should behave)
""",
    "HEARTBEAT.md": """# Heartbeat Tasks

This file is checked every 30 minutes by your nanobot agent.
Add tasks below that you want the agent to work on periodically.

If this file has no tasks (only headers and comments), the agent will skip the heartbeat.

## Active Tasks

<!-- Add your periodic tasks below this line -->


## Completed

<!-- Move completed tasks here or delete them -->
""",
    "TOOLS.md": "",
    "status_update.py": """#!/usr/bin/env python3
\"\"\"Status update script \u2014 runs every 30s via cron to update node gauge and status.

Output a JSON object to stdout with any of these optional fields:
  gauge_value (0-100), gauge_label, gauge_unit, status (ok/warning/error), status_message

Customize this script to monitor whatever matters for your node.
\"\"\"
import json

# Default: report OK status with no gauge
# Replace this with your monitoring logic
print(json.dumps({
    "status": "ok",
    "status_message": "Idle",
}))
""",
    "api.py": """#!/usr/bin/env python3
\"\"\"Default API backend — replaced during genesis with a real implementation.\"\"\"
import sys, json

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        print(json.dumps({"status": "ok", "message": "Awaiting configuration"}))
    else:
        print(json.dumps({"error": f"Unknown command: {cmd}"}))

if __name__ == "__main__":
    main()
""",
}


# ---------------------------------------------------------------------------
# Node summary builder (used by nodes.py and chat.py)
# ---------------------------------------------------------------------------

def node_summary(
    node: Node,
    edge_type: str | None = None,
    chat_enabled: bool | None = None,
) -> dict:
    """Build a summary dict for a node.

    Contains the fields that network-topology and peer-config endpoints
    expose: id, name, identity, agent_status, agent_status_message, and
    optionally the edge_type and chat_enabled linking this node in context.
    """
    summary: dict = {
        "id": str(node.id),
        "name": node.name,
        "identity": node.identity,
        "agent_status": node.agent_status,
        "agent_status_message": node.agent_status_message,
    }
    if edge_type is not None:
        summary["edge_type"] = edge_type
    if chat_enabled is not None:
        summary["chat_enabled"] = chat_enabled
    return summary


# ---------------------------------------------------------------------------
# Identity name-drift sync (shared by chat.py, main.py, node_status.py)
# ---------------------------------------------------------------------------

async def sync_identity_name(
    container_id: str,
    expected_name: str,
    identity: dict,
) -> dict:
    """Fix name drift in an identity dict and write the correction back.

    If ``identity["name"]`` differs from *expected_name*, the dict is
    updated in place **and** the corrected JSON is written back into the
    container's ``identity.json``.

    Returns the (possibly corrected) *identity* dict.
    """
    if (
        isinstance(identity, dict)
        and "name" in identity
        and identity["name"] != expected_name
    ):
        identity["name"] = expected_name
        try:
            updated = json.dumps(identity, indent=2)
            await asyncio.to_thread(
                write_workspace_file, container_id, "identity.json", updated,
            )
        except Exception:
            logger.debug(
                "Failed to sync identity.json back to container %s",
                container_id,
            )
    return identity


# ---------------------------------------------------------------------------
# Network topology query (shared by node_network.py, chat.py)
# ---------------------------------------------------------------------------

async def get_network_topology(
    node_id: UUID,
    db: AsyncSession,
    *,
    include_edge_types: bool = False,
) -> dict:
    """Fetch parents / children / siblings for *node_id*.

    When *include_edge_types* is ``True`` the ``edge_type`` and
    ``chat_enabled`` labels are attached to each parent and child summary
    (used by the REST endpoint).  The chat relay omits these for a lighter
    payload but still includes ``chat_enabled``.

    Returns an empty dict when the node is not found.
    """
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

    child_edge_types = {e.target_id: e.edge_type for e in edges_out} if include_edge_types else {}
    parent_edge_types = {e.source_id: e.edge_type for e in edges_in} if include_edge_types else {}

    # Chat-enabled lookup (always included so nanobots know who they can message)
    child_chat = {e.target_id: e.chat_enabled for e in edges_out}
    parent_chat = {e.source_id: e.chat_enabled for e in edges_in}

    # Siblings = other children of our parents
    sibling_ids: set[UUID] = set()
    if parent_ids:
        sibling_edges = (await db.execute(
            select(Edge).where(
                Edge.source_id.in_(parent_ids),
                Edge.target_id != node_id,
            )
        )).scalars().all()
        sibling_ids = {e.target_id for e in sibling_edges}

    # Fetch all related nodes in one query
    all_ids = set(child_ids) | set(parent_ids) | sibling_ids
    related: dict[UUID, Node] = {}
    if all_ids:
        result = await db.execute(select(Node).where(Node.id.in_(all_ids)))
        related = {n.id: n for n in result.scalars().all()}

    if include_edge_types:
        return {
            "self": node_summary(node),
            "parents": [
                node_summary(related[pid], parent_edge_types.get(pid, "connection"),
                             chat_enabled=parent_chat.get(pid, False))
                for pid in parent_ids if pid in related
            ],
            "children": [
                node_summary(related[cid], child_edge_types.get(cid, "connection"),
                             chat_enabled=child_chat.get(cid, False))
                for cid in child_ids if cid in related
            ],
            "siblings": [
                node_summary(related[sid])
                for sid in sibling_ids if sid in related
            ],
        }

    return {
        "self": node_summary(node),
        "parents": [
            node_summary(related[p], chat_enabled=parent_chat.get(p, False))
            for p in parent_ids if p in related
        ],
        "children": [
            node_summary(related[c], chat_enabled=child_chat.get(c, False))
            for c in child_ids if c in related
        ],
        "siblings": [node_summary(related[s]) for s in sibling_ids if s in related],
    }


async def get_chat_peers(node_id: UUID, db: AsyncSession) -> list[dict]:
    """BFS over chat-enabled edges to find all transitively reachable peers.

    Edges are treated as undirected — if A->B has chat_enabled, then both
    A and B can communicate.  Returns a list of ``node_summary()`` dicts
    for every reachable peer (excluding the starting node).
    """
    # Load all chat-enabled edges in one query
    chat_edges = (await db.execute(
        select(Edge).where(Edge.chat_enabled.is_(True))
    )).scalars().all()

    # Build undirected adjacency list
    adj: dict[UUID, set[UUID]] = {}
    for e in chat_edges:
        adj.setdefault(e.source_id, set()).add(e.target_id)
        adj.setdefault(e.target_id, set()).add(e.source_id)

    # BFS from node_id
    visited: set[UUID] = {node_id}
    queue = list(adj.get(node_id, []))
    reachable: set[UUID] = set()
    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        reachable.add(current)
        for neighbor in adj.get(current, []):
            if neighbor not in visited:
                queue.append(neighbor)

    if not reachable:
        return []

    # Fetch all reachable nodes
    result = await db.execute(select(Node).where(Node.id.in_(reachable)))
    nodes = {n.id: n for n in result.scalars().all()}
    return [node_summary(nodes[nid]) for nid in reachable if nid in nodes]


# ---------------------------------------------------------------------------
# Container setup (shared by create_node, create_child_node, recreate_container)
# ---------------------------------------------------------------------------

async def _resolve_templates(canvas_state: CanvasState | None) -> dict[str, str]:
    """Return the template batch to write, filtered by ALLOWED_WORKSPACE_FILES."""
    templates = (
        canvas_state.default_agent_templates
        if canvas_state and canvas_state.default_agent_templates
        else DEFAULT_TEMPLATES
    )
    return {
        fn: content for fn, content in templates.items()
        if fn in ALLOWED_WORKSPACE_FILES and content
    }


async def recreate_container(node: "Node", db: "AsyncSession") -> None:
    """Recreate a missing container for an existing node, re-applying config and templates.

    Updates node.container_id and node.container_status in place (caller must commit).
    """
    # Prefer the node's cached config; setup_container falls back to canvas default.
    await setup_container(node, db, config_override=node.config or None)


async def setup_container(
    node: Node,
    db: AsyncSession,
    *,
    config_override: dict | None = None,
) -> str:
    """Create a nanobot container for *node* and apply config + templates.

    This is the single place that performs the repeated sequence:

      1. ``create_nanobot_container``
      2. Apply config (explicit *config_override*, or the canvas default)
      3. Write agent template files filtered through ``ALLOWED_WORKSPACE_FILES``

    The caller is responsible for committing the session.

    Parameters
    ----------
    node:
        The Node ORM object.  ``container_id``, ``container_status`` and
        ``config`` are updated **in place**.
    db:
        The current async DB session (used to read ``CanvasState``).
    config_override:
        If supplied, this config dict is written to the container **instead**
        of the canvas default.  Useful for cloning / recreating a node that
        already has a cached config.

    Returns
    -------
    str
        The new Docker container id.
    """
    container_id = await asyncio.to_thread(
        create_nanobot_container, str(node.id), node.name
    )
    node.container_id = container_id
    node.container_status = "running"

    canvas_state = await db.get(CanvasState, "default")

    # --- config ---
    if config_override:
        await asyncio.to_thread(write_nanobot_config, container_id, config_override)
        node.config = config_override
    elif canvas_state and canvas_state.default_nanobot_config:
        await asyncio.to_thread(
            write_nanobot_config, container_id, canvas_state.default_nanobot_config
        )
        node.config = canvas_state.default_nanobot_config

    # --- templates ---
    batch = await _resolve_templates(canvas_state)
    if batch:
        await asyncio.to_thread(write_workspace_files_batch, container_id, batch)

    return container_id
