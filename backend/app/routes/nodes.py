"""Node CRUD and nanobot container lifecycle."""

import asyncio
import json
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.broadcast import broadcast
from app.db import CanvasState, Edge, Node, emit_event, get_db
from app.docker_ops import (
    create_nanobot_container,
    get_container_logs,
    get_container_stats,
    get_container_status,
    list_workspace_files,
    restart_nanobot_container,
    stop_nanobot_container,
    read_nanobot_config,
    write_nanobot_config,
    read_workspace_file,
    write_workspace_file,
    write_workspace_files_batch,
)

router = APIRouter(tags=["nodes"])

log = __import__("logging").getLogger("paradise")


async def _recreate_container(node: Node, db: AsyncSession) -> None:
    """Recreate a missing container for an existing node, re-applying config and templates.

    Updates node.container_id and node.container_status in place (caller must commit).
    """
    container_id = await asyncio.to_thread(
        create_nanobot_container, str(node.id), node.name
    )
    node.container_id = container_id
    node.container_status = "running"

    canvas_state = await db.get(CanvasState, "default")

    # Re-apply config: prefer node's cached config, fall back to canvas default
    if node.config:
        await asyncio.to_thread(write_nanobot_config, container_id, node.config)
    elif canvas_state and canvas_state.default_nanobot_config:
        await asyncio.to_thread(
            write_nanobot_config, container_id, canvas_state.default_nanobot_config
        )
        node.config = canvas_state.default_nanobot_config

    # Write agent templates
    templates = (
        canvas_state.default_agent_templates
        if canvas_state and canvas_state.default_agent_templates
        else DEFAULT_TEMPLATES
    )
    batch = {
        fn: content for fn, content in templates.items()
        if fn in ALLOWED_WORKSPACE_FILES and content
    }
    if batch:
        await asyncio.to_thread(write_workspace_files_batch, container_id, batch)


class NodeCreate(BaseModel):
    name: str = "new-nanobot"
    position_x: float = 0.0
    position_y: float = 0.0


class NodeUpdate(BaseModel):
    name: str | None = None
    position_x: float | None = None
    position_y: float | None = None
    width: float | None = None
    height: float | None = None


class NodeRead(BaseModel):
    id: UUID
    name: str
    container_id: str | None
    container_status: str | None
    position_x: float
    position_y: float
    width: float
    height: float
    config: dict | None
    identity: dict | None = None
    agent_status: str | None = None
    agent_status_message: str | None = None
    gauge_value: float | None = None
    gauge_label: str | None = None
    gauge_unit: str | None = None
    created_at: str | None
    updated_at: str | None

    model_config = {"from_attributes": True}


@router.post("/nodes", response_model=NodeRead)
async def create_node(payload: NodeCreate, db: AsyncSession = Depends(get_db)):
    node_id = uuid4()
    node = Node(
        id=node_id,
        name=payload.name,
        position_x=payload.position_x,
        position_y=payload.position_y,
    )

    # Spin up nanobot container
    try:
        container_id = await asyncio.to_thread(
            create_nanobot_container, str(node_id), payload.name
        )
        node.container_id = container_id
        node.container_status = "running"

        canvas_state = await db.get(CanvasState, "default")
        # Apply default config if one is set
        if canvas_state and canvas_state.default_nanobot_config:
            await asyncio.to_thread(
                write_nanobot_config, container_id, canvas_state.default_nanobot_config
            )
            node.config = canvas_state.default_nanobot_config

        # Write default agent templates into the container workspace
        templates = (
            canvas_state.default_agent_templates
            if canvas_state and canvas_state.default_agent_templates
            else DEFAULT_TEMPLATES
        )
        batch = {
            fn: content for fn, content in templates.items()
            if fn in ALLOWED_WORKSPACE_FILES and content
        }
        if batch:
            await asyncio.to_thread(write_workspace_files_batch, container_id, batch)
    except Exception as exc:
        node.container_status = "error"
        node.config = {"error": str(exc)}

    db.add(node)
    await db.commit()
    await db.refresh(node)
    await emit_event("node_created", node_id=node.id, node_name=node.name,
                     summary=f'Node "{node.name}" created')
    return node


@router.get("/nodes", response_model=list[NodeRead])
async def list_nodes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).order_by(Node.created_at))
    return result.scalars().all()


@router.get("/nodes/{node_id}", response_model=NodeRead)
async def get_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    # Refresh container status
    if node.container_id:
        node.container_status = await asyncio.to_thread(
            get_container_status, node.container_id
        )
        await db.commit()
    return node


async def _sync_identity_name(container_id: str, new_name: str) -> None:
    """Update the name field in identity.json inside a container."""
    content = await asyncio.to_thread(read_workspace_file, container_id, "identity.json")
    if not content:
        return
    try:
        identity = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return
    if not isinstance(identity, dict):
        return
    identity["name"] = new_name
    await asyncio.to_thread(
        write_workspace_file, container_id, "identity.json", json.dumps(identity, indent=2)
    )


@router.patch("/nodes/{node_id}", response_model=NodeRead)
async def update_node(node_id: UUID, payload: NodeUpdate, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    old_name = node.name
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(node, field, value)
    await db.commit()
    await db.refresh(node)

    # Keep container identity.json in sync when the node is renamed
    if "name" in updates and node.container_id:
        try:
            await _sync_identity_name(node.container_id, updates["name"])
        except Exception:
            pass  # Don't fail the rename if identity sync fails

    if "name" in updates and updates["name"] != old_name:
        await emit_event("node_renamed", node_id=node.id, node_name=node.name,
                         summary=f'Node renamed "{old_name}" → "{node.name}"',
                         details={"old_name": old_name, "new_name": node.name})
        await broadcast.publish("rename", {
            "node_id": str(node.id),
            "name": node.name,
        })

    return node


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    node_name = node.name
    # Stop and remove container
    if node.container_id:
        await asyncio.to_thread(stop_nanobot_container, node.container_id)
    await db.delete(node)
    await db.commit()
    await emit_event("node_deleted", node_id=None, node_name=node_name,
                     summary=f'Node "{node_name}" deleted')
    return {"ok": True}


@router.post("/nodes/{node_id}/clone", response_model=NodeRead)
async def clone_node(node_id: UUID, payload: dict, db: AsyncSession = Depends(get_db)):
    """Clone a node: create a new container with the same config and workspace files."""
    source = await db.get(Node, node_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source node not found")

    new_id = uuid4()
    pos_x = payload.get("position_x", source.position_x + 120)
    pos_y = payload.get("position_y", source.position_y + 60)

    node = Node(
        id=new_id,
        name=f"{source.name}-clone",
        position_x=pos_x,
        position_y=pos_y,
    )

    try:
        container_id = await asyncio.to_thread(
            create_nanobot_container, str(new_id), node.name
        )
        node.container_id = container_id
        node.container_status = "running"

        # Copy nanobot config
        if source.config:
            await asyncio.to_thread(write_nanobot_config, container_id, source.config)
            node.config = source.config

        # Copy identity
        if source.identity:
            node.identity = source.identity

        # Copy workspace files from source container
        if source.container_id:
            files_to_copy = set(ALLOWED_WORKSPACE_FILES)
            if source.identity and isinstance(source.identity, dict):
                for tab in source.identity.get("tabs", []):
                    if isinstance(tab, dict) and isinstance(tab.get("file"), str):
                        fname = tab["file"]
                        if "/" not in fname and "\\" not in fname and ".." not in fname:
                            files_to_copy.add(fname)
            # Read all source files, then batch write to new container
            batch: dict[str, str] = {}
            for filename in files_to_copy:
                content = await asyncio.to_thread(
                    read_workspace_file, source.container_id, filename
                )
                if content:
                    batch[filename] = content
            if batch:
                await asyncio.to_thread(
                    write_workspace_files_batch, container_id, batch
                )
    except Exception as exc:
        node.container_status = "error"
        node.config = {"error": str(exc)}

    db.add(node)
    await db.commit()
    await db.refresh(node)
    await emit_event("node_cloned", node_id=node.id, node_name=node.name,
                     summary=f'Node "{node.name}" cloned from "{source.name}"',
                     details={"source_id": str(source.id), "source_name": source.name})
    return node


@router.get("/nodes/{node_id}/logs")
async def node_logs(node_id: UUID, tail: int = 100, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    logs = await asyncio.to_thread(get_container_logs, node.container_id, tail)
    return {"logs": logs}


@router.post("/nodes/{node_id}/restart")
async def restart_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # If container is gone, recreate it; otherwise just restart
    status = (
        await asyncio.to_thread(get_container_status, node.container_id)
        if node.container_id
        else "not_found"
    )
    if status == "not_found":
        try:
            await _recreate_container(node, db)
        except Exception as exc:
            node.container_status = "error"
            raise HTTPException(status_code=500, detail=str(exc))
    else:
        await asyncio.to_thread(restart_nanobot_container, node.container_id)
        node.container_status = "running"

    await db.commit()
    await emit_event("container_restart", node_id=node.id, node_name=node.name,
                     summary=f'Container restarted for "{node.name}"')
    return {"ok": True}


@router.post("/nodes/{node_id}/rebuild")
async def rebuild_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Stop and remove the old container, create a fresh one from the current image."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Stop and remove old container
    if node.container_id:
        await asyncio.to_thread(stop_nanobot_container, node.container_id)

    # Create new container with config and templates
    try:
        await _recreate_container(node, db)
    except Exception as exc:
        node.container_status = "error"
        raise HTTPException(status_code=500, detail=str(exc))

    await db.commit()
    await emit_event("container_rebuild", node_id=node.id, node_name=node.name,
                     summary=f'Container rebuilt for "{node.name}"')
    return {"ok": True}


@router.get("/nodes/{node_id}/config")
async def get_node_config(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    config = await asyncio.to_thread(read_nanobot_config, node.container_id)
    return {"config": config}


@router.put("/nodes/{node_id}/config")
async def update_node_config(node_id: UUID, payload: dict, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    await asyncio.to_thread(
        write_nanobot_config, node.container_id, payload.get("config", {})
    )
    # Cache config snapshot
    node.config = payload.get("config", {})
    await db.commit()
    return {"ok": True}


@router.get("/nodes/{node_id}/stats")
async def get_node_stats(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    status = await asyncio.to_thread(get_container_status, node.container_id)
    stats = await asyncio.to_thread(get_container_stats, node.container_id)
    return {
        "container_id": node.container_id[:12],
        "status": status,
        "stats": stats,
        "name": node.name,
        "created_at": node.created_at,
    }


ALLOWED_WORKSPACE_FILES = {
    "SOUL.md", "AGENTS.md", "USER.md", "HEARTBEAT.md", "TOOLS.md", "identity.json",
    "dashboard.html", "config.html", "commands.html", "children.html",
    "settings.json", "api.py", "recommendations.json",
}


def _allowed_files_for_node(node: Node) -> set[str]:
    """Return allowed workspace filenames: defaults + files declared in identity tabs."""
    allowed = set(ALLOWED_WORKSPACE_FILES)
    if node.identity and isinstance(node.identity, dict):
        tabs = node.identity.get("tabs")
        if isinstance(tabs, list):
            for tab in tabs:
                if isinstance(tab, dict) and isinstance(tab.get("file"), str):
                    fname = tab["file"]
                    # Security: only allow simple filenames, no path traversal
                    if "/" not in fname and "\\" not in fname and ".." not in fname:
                        allowed.add(fname)
    return allowed

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

**Do NOT just write reminders to MEMORY.md** — that won't trigger actual notifications.

## Heartbeat Tasks

`HEARTBEAT.md` is checked every 30 minutes. Use file tools to manage periodic tasks:

- **Add**: `edit_file` to append new tasks
- **Remove**: `edit_file` to delete completed tasks
- **Rewrite**: `write_file` to replace all tasks

When the user asks for a recurring/periodic task, update `HEARTBEAT.md` instead of creating a one-time cron reminder.

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
}


@router.get("/nodes/{node_id}/files/{filename}")
async def get_workspace_file(node_id: UUID, filename: str, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    if filename not in _allowed_files_for_node(node):
        raise HTTPException(status_code=400, detail="File not allowed")
    content = await asyncio.to_thread(read_workspace_file, node.container_id, filename)
    # Fall back to stored defaults, then hardcoded defaults (only for default files)
    if not content and filename in DEFAULT_TEMPLATES:
        canvas_state = await db.get(CanvasState, "default")
        templates = (
            canvas_state.default_agent_templates
            if canvas_state and canvas_state.default_agent_templates
            else DEFAULT_TEMPLATES
        )
        content = templates.get(filename, "")
        if content:
            await asyncio.to_thread(
                write_workspace_file, node.container_id, filename, content
            )
    return {"filename": filename, "content": content}


@router.put("/nodes/{node_id}/files/{filename}")
async def put_workspace_file(node_id: UUID, filename: str, payload: dict, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    if filename not in _allowed_files_for_node(node):
        raise HTTPException(status_code=400, detail="File not allowed")
    await asyncio.to_thread(
        write_workspace_file, node.container_id, filename, payload.get("content", "")
    )
    return {"ok": True}


def _is_safe_filename(filename: str) -> bool:
    """Check that a filename is safe (no path traversal, no absolute paths)."""
    return (
        bool(filename)
        and "/" not in filename
        and "\\" not in filename
        and ".." not in filename
        and not filename.startswith(".")
    )


@router.get("/nodes/{node_id}/workspace")
async def list_node_workspace(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """List all files in a node's workspace directory."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    files = await asyncio.to_thread(list_workspace_files, node.container_id)
    # Check if config.json exists
    config = await asyncio.to_thread(read_nanobot_config, node.container_id)
    has_config = bool(config)
    return {"files": files, "has_config": has_config}


@router.get("/nodes/{node_id}/workspace/{filename}")
async def get_workspace_file_unrestricted(
    node_id: UUID, filename: str, db: AsyncSession = Depends(get_db),
):
    """Read any file from the workspace (no allowlist, just path safety)."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    if not _is_safe_filename(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    content = await asyncio.to_thread(read_workspace_file, node.container_id, filename)
    return {"filename": filename, "content": content or ""}


@router.put("/nodes/{node_id}/workspace/{filename}")
async def put_workspace_file_unrestricted(
    node_id: UUID, filename: str, payload: dict, db: AsyncSession = Depends(get_db),
):
    """Write any file to the workspace (no allowlist, just path safety)."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    if not _is_safe_filename(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    await asyncio.to_thread(
        write_workspace_file, node.container_id, filename, payload.get("content", "")
    )
    return {"ok": True}


@router.put("/nodes/{node_id}/agent-status")
async def set_agent_status(node_id: UUID, payload: dict, db: AsyncSession = Depends(get_db)):
    """Set agent-reported status (ok, warning, error) from PARADISE.setStatus()."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    status = payload.get("status", "").strip().lower()
    if status not in ("ok", "warning", "error", ""):
        raise HTTPException(status_code=400, detail="Status must be ok, warning, or error")
    node.agent_status = status or None
    node.agent_status_message = payload.get("message", "")[:200] or None
    await db.commit()
    msg = node.agent_status_message or ""
    await emit_event("agent_status", node_id=node.id, node_name=node.name,
                     summary=f'{node.name}: {status}' + (f' — {msg}' if msg else ''),
                     details={"status": status, "message": msg})
    await broadcast.publish("agent_status", {
        "node_id": str(node_id),
        "agent_status": node.agent_status,
        "agent_status_message": node.agent_status_message,
    })
    return {"ok": True, "agent_status": node.agent_status}


@router.put("/nodes/{node_id}/gauge")
async def set_gauge(node_id: UUID, payload: dict, db: AsyncSession = Depends(get_db)):
    """Set agent-reported gauge value (0-100) from PARADISE.setGauge()."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    raw_value = payload.get("value")
    if raw_value is None:
        node.gauge_value = None
        node.gauge_label = None
        node.gauge_unit = None
    else:
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="value must be a number 0-100")
        if value < 0 or value > 100:
            raise HTTPException(status_code=400, detail="value must be between 0 and 100")
        node.gauge_value = value
        node.gauge_label = str(payload.get("label", ""))[:100] or None
        node.gauge_unit = str(payload.get("unit", ""))[:20] or None
    await db.commit()
    await broadcast.publish("gauge", {
        "node_id": str(node_id),
        "gauge_value": node.gauge_value,
        "gauge_label": node.gauge_label,
        "gauge_unit": node.gauge_unit,
    })
    return {"ok": True, "gauge_value": node.gauge_value, "gauge_label": node.gauge_label, "gauge_unit": node.gauge_unit}


@router.get("/nodes/{node_id}/identity")
async def get_node_identity(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Read identity.json from the nanobot container and cache in DB."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    content = await asyncio.to_thread(
        read_workspace_file, node.container_id, "identity.json"
    )
    if not content:
        return {"identity": None}

    try:
        identity = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return {"identity": None}

    # Sync DB node name back into identity if it has drifted
    if isinstance(identity, dict) and "name" in identity and identity["name"] != node.name:
        identity["name"] = node.name
        try:
            await asyncio.to_thread(
                write_workspace_file,
                node.container_id, "identity.json", json.dumps(identity, indent=2),
            )
        except Exception:
            pass

    # Cache in DB for fast canvas loads
    node.identity = identity
    await db.commit()

    return {"identity": identity}


def _node_summary(node: Node, edge_type: str | None = None) -> dict:
    """Build a summary dict for a node."""
    summary: dict = {
        "id": str(node.id),
        "name": node.name,
        "identity": node.identity,
        "agent_status": node.agent_status,
        "agent_status_message": node.agent_status_message,
    }
    if edge_type is not None:
        summary["edge_type"] = edge_type
    return summary


@router.get("/nodes/{node_id}/network")
async def get_node_network(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get the network topology from this node's perspective.

    Parents = nodes with edges pointing into this node (source->this).
    Children = nodes this node points to (this->target).
    Siblings = other children of the same parents.
    """
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Edges out (this -> children) and in (parents -> this)
    edges_out = (await db.execute(
        select(Edge).where(Edge.source_id == node_id)
    )).scalars().all()
    edges_in = (await db.execute(
        select(Edge).where(Edge.target_id == node_id)
    )).scalars().all()

    child_ids = [e.target_id for e in edges_out]
    parent_ids = [e.source_id for e in edges_in]
    child_edge_types = {e.target_id: e.edge_type for e in edges_out}
    parent_edge_types = {e.source_id: e.edge_type for e in edges_in}

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
    all_related_ids = set(child_ids) | set(parent_ids) | sibling_ids
    related: dict[UUID, Node] = {}
    if all_related_ids:
        result = await db.execute(select(Node).where(Node.id.in_(all_related_ids)))
        related = {n.id: n for n in result.scalars().all()}

    return {
        "self": _node_summary(node),
        "parents": [
            _node_summary(related[pid], parent_edge_types.get(pid, "connection"))
            for pid in parent_ids if pid in related
        ],
        "children": [
            _node_summary(related[cid], child_edge_types.get(cid, "connection"))
            for cid in child_ids if cid in related
        ],
        "siblings": [
            _node_summary(related[sid])
            for sid in sibling_ids if sid in related
        ],
    }


@router.get("/nodes/{node_id}/network/config/{peer_id}")
async def get_peer_config(node_id: UUID, peer_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get config and workspace files from a peer node (must be connected by an edge)."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    peer = await db.get(Node, peer_id)
    if not peer:
        raise HTTPException(status_code=404, detail="Peer not found")

    # Verify they are connected (edge in either direction)
    edge = (await db.execute(
        select(Edge).where(
            ((Edge.source_id == node_id) & (Edge.target_id == peer_id))
            | ((Edge.source_id == peer_id) & (Edge.target_id == node_id))
        )
    )).scalars().first()
    if not edge:
        raise HTTPException(status_code=403, detail="Nodes are not connected")

    # Read peer config and key workspace files
    config = (
        await asyncio.to_thread(read_nanobot_config, peer.container_id)
        if peer.container_id
        else {}
    )
    workspace_files: dict[str, str] = {}
    if peer.container_id:
        for filename in ("identity.json", "SOUL.md", "AGENTS.md", "dashboard.html", "commands.html", "api.py"):
            content = await asyncio.to_thread(
                read_workspace_file, peer.container_id, filename
            )
            if content:
                workspace_files[filename] = content

    return {
        "peer": _node_summary(peer),
        "config": config,
        "workspace_files": workspace_files,
    }


@router.get("/nodes/{node_id}/recommendations")
async def get_recommendations(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Read recommendations.json from a node's container and return validated entries."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    content = await asyncio.to_thread(
        read_workspace_file, node.container_id, "recommendations.json"
    )
    if not content:
        return {"recommendations": []}

    try:
        data = json.loads(content)
        recs = data if isinstance(data, list) else data.get("recommendations", [])
        validated = []
        for r in recs:
            if not isinstance(r, dict) or not r.get("name") or not r.get("genesis_prompt"):
                continue
            validated.append({
                "name": str(r["name"])[:60],
                "genesis_prompt": str(r["genesis_prompt"]),
                "icon": str(r.get("icon", "")),
                "emoji": str(r.get("emoji", "")),
                "description": str(r.get("description", ""))[:200],
            })
        return {"recommendations": validated[:10]}
    except (json.JSONDecodeError, TypeError):
        return {"recommendations": []}


class ChildNodeCreate(BaseModel):
    name: str
    genesis_prompt: str
    icon: str | None = None
    emoji: str | None = None
    description: str | None = None
    position_x: float | None = None
    position_y: float | None = None


class ChildNodeResponse(BaseModel):
    node: NodeRead
    edge_id: UUID
    genesis_prompt: str


@router.post("/nodes/{parent_id}/children", response_model=ChildNodeResponse)
async def create_child_node(
    parent_id: UUID,
    payload: ChildNodeCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a child node from a recommendation, auto-creating the parent->child edge."""
    parent = await db.get(Node, parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent node not found")

    # Position child near parent
    pos_x = payload.position_x if payload.position_x is not None else parent.position_x + 120
    pos_y = payload.position_y if payload.position_y is not None else parent.position_y + 150

    # Enrich genesis prompt with parent context
    parts = [payload.genesis_prompt, "\n\n## Parent Context", f"Parent node: {parent.name}"]
    if parent.identity:
        parts.append(f"Parent identity: {json.dumps(parent.identity)}")
    if parent.container_id:
        settings_content = await asyncio.to_thread(
            read_workspace_file, parent.container_id, "settings.json"
        )
        if settings_content:
            parts.append(f"Parent settings: {settings_content}")
    enriched_prompt = "\n".join(parts)

    # Create child node
    node_id = uuid4()
    node = Node(
        id=node_id,
        name=payload.name,
        position_x=pos_x,
        position_y=pos_y,
    )

    try:
        container_id = await asyncio.to_thread(
            create_nanobot_container, str(node_id), payload.name
        )
        node.container_id = container_id
        node.container_status = "running"

        canvas_state = await db.get(CanvasState, "default")
        if canvas_state and canvas_state.default_nanobot_config:
            await asyncio.to_thread(
                write_nanobot_config, container_id, canvas_state.default_nanobot_config
            )
            node.config = canvas_state.default_nanobot_config

        templates = (
            canvas_state.default_agent_templates
            if canvas_state and canvas_state.default_agent_templates
            else DEFAULT_TEMPLATES
        )
        batch = {
            fn: content for fn, content in templates.items()
            if fn in ALLOWED_WORKSPACE_FILES and content
        }
        if batch:
            await asyncio.to_thread(write_workspace_files_batch, container_id, batch)
    except Exception as exc:
        node.container_status = "error"
        node.config = {"error": str(exc)}

    db.add(node)

    # Create edge: parent -> child
    edge = Edge(
        id=uuid4(),
        source_id=parent_id,
        target_id=node_id,
        edge_type="connection",
        source_handle="bottom-s",
        target_handle="top-t",
    )
    db.add(edge)

    await db.commit()
    await db.refresh(node)

    await emit_event(
        "child_node_created",
        node_id=node.id,
        node_name=node.name,
        summary=f'Child "{node.name}" created from "{parent.name}"',
        details={"parent_id": str(parent_id), "parent_name": parent.name},
    )

    return ChildNodeResponse(
        node=NodeRead.model_validate(node),
        edge_id=edge.id,
        genesis_prompt=enriched_prompt,
    )
