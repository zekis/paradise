"""Node CRUD and nanobot container lifecycle."""

import json
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import CanvasState, Edge, Node, get_db
from app.docker_ops import (
    create_nanobot_container,
    get_container_logs,
    get_container_stats,
    get_container_status,
    restart_nanobot_container,
    stop_nanobot_container,
    read_nanobot_config,
    write_nanobot_config,
    read_workspace_file,
    write_workspace_file,
)

router = APIRouter(tags=["nodes"])


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
        container_id = create_nanobot_container(str(node_id), payload.name)
        node.container_id = container_id
        node.container_status = "running"

        canvas_state = await db.get(CanvasState, "default")
        # Apply default config if one is set
        if canvas_state and canvas_state.default_nanobot_config:
            write_nanobot_config(container_id, canvas_state.default_nanobot_config)
            node.config = canvas_state.default_nanobot_config

        # Write default agent templates into the container workspace
        templates = (
            canvas_state.default_agent_templates
            if canvas_state and canvas_state.default_agent_templates
            else DEFAULT_TEMPLATES
        )
        for filename, content in templates.items():
            if filename in ALLOWED_WORKSPACE_FILES and content:
                write_workspace_file(container_id, filename, content)
    except Exception as exc:
        node.container_status = "error"
        node.config = {"error": str(exc)}

    db.add(node)
    await db.commit()
    await db.refresh(node)
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
        node.container_status = get_container_status(node.container_id)
        await db.commit()
    return node


@router.patch("/nodes/{node_id}", response_model=NodeRead)
async def update_node(node_id: UUID, payload: NodeUpdate, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(node, field, value)
    await db.commit()
    await db.refresh(node)
    return node


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    # Stop and remove container
    if node.container_id:
        stop_nanobot_container(node.container_id)
    await db.delete(node)
    await db.commit()
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
        container_id = create_nanobot_container(str(new_id), node.name)
        node.container_id = container_id
        node.container_status = "running"

        # Copy nanobot config
        if source.config:
            write_nanobot_config(container_id, source.config)
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
            for filename in files_to_copy:
                content = read_workspace_file(source.container_id, filename)
                if content:
                    write_workspace_file(container_id, filename, content)
    except Exception as exc:
        node.container_status = "error"
        node.config = {"error": str(exc)}

    db.add(node)
    await db.commit()
    await db.refresh(node)
    return node


@router.get("/nodes/{node_id}/logs")
async def node_logs(node_id: UUID, tail: int = 100, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    logs = get_container_logs(node.container_id, tail=tail)
    return {"logs": logs}


@router.post("/nodes/{node_id}/restart")
async def restart_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # If container is gone, recreate it
    status = get_container_status(node.container_id) if node.container_id else "not_found"
    if status == "not_found":
        try:
            container_id = create_nanobot_container(str(node.id), node.name)
            node.container_id = container_id
            node.container_status = "running"
        except Exception as exc:
            node.container_status = "error"
            raise HTTPException(status_code=500, detail=str(exc))
    else:
        restart_nanobot_container(node.container_id)
        node.container_status = "running"

    await db.commit()
    return {"ok": True}


@router.post("/nodes/{node_id}/rebuild")
async def rebuild_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Stop and remove the old container, create a fresh one from the current image."""
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Stop and remove old container
    if node.container_id:
        stop_nanobot_container(node.container_id)

    # Create new container
    try:
        container_id = create_nanobot_container(str(node.id), node.name)
        node.container_id = container_id
        node.container_status = "running"

        # Re-apply config
        canvas_state = await db.get(CanvasState, "default")
        if node.config:
            write_nanobot_config(container_id, node.config)
        elif canvas_state and canvas_state.default_nanobot_config:
            write_nanobot_config(container_id, canvas_state.default_nanobot_config)
            node.config = canvas_state.default_nanobot_config

        # Write agent templates
        templates = (
            canvas_state.default_agent_templates
            if canvas_state and canvas_state.default_agent_templates
            else DEFAULT_TEMPLATES
        )
        for filename, content in templates.items():
            if filename in ALLOWED_WORKSPACE_FILES and content:
                write_workspace_file(container_id, filename, content)
    except Exception as exc:
        node.container_status = "error"
        raise HTTPException(status_code=500, detail=str(exc))

    await db.commit()
    return {"ok": True}


@router.get("/nodes/{node_id}/config")
async def get_node_config(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    config = read_nanobot_config(node.container_id)
    return {"config": config}


@router.put("/nodes/{node_id}/config")
async def update_node_config(node_id: UUID, payload: dict, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    write_nanobot_config(node.container_id, payload.get("config", {}))
    # Cache config snapshot
    node.config = payload.get("config", {})
    await db.commit()
    return {"ok": True}


@router.get("/nodes/{node_id}/stats")
async def get_node_stats(node_id: UUID, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    status = get_container_status(node.container_id)
    stats = get_container_stats(node.container_id)
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
    "settings.json", "api.py",
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
    content = read_workspace_file(node.container_id, filename)
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
            write_workspace_file(node.container_id, filename, content)
    return {"filename": filename, "content": content}


@router.put("/nodes/{node_id}/files/{filename}")
async def put_workspace_file(node_id: UUID, filename: str, payload: dict, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    if filename not in _allowed_files_for_node(node):
        raise HTTPException(status_code=400, detail="File not allowed")
    write_workspace_file(node.container_id, filename, payload.get("content", ""))
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
    return {"ok": True, "agent_status": node.agent_status}


@router.get("/nodes/{node_id}/identity")
async def get_node_identity(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Read identity.json from the nanobot container and cache in DB."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")

    content = read_workspace_file(node.container_id, "identity.json")
    if not content:
        return {"identity": None}

    try:
        identity = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return {"identity": None}

    # Cache in DB for fast canvas loads
    node.identity = identity
    await db.commit()

    return {"identity": identity}
