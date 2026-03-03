"""Workspace file read/write/list endpoints for nanobot containers."""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db import CanvasState, Node, get_db
from app.docker_ops import (
    list_workspace_files,
    read_nanobot_config,
    read_workspace_file,
    write_workspace_file,
)
from app.routes.helpers import ALLOWED_WORKSPACE_FILES, DEFAULT_TEMPLATES

logger = logging.getLogger(__name__)

router = APIRouter(tags=["workspace"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class WorkspaceFileRequest(BaseModel):
    content: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _is_safe_filename(filename: str) -> bool:
    """Check that a filename is safe (no path traversal, no absolute paths)."""
    return (
        bool(filename)
        and "/" not in filename
        and "\\" not in filename
        and ".." not in filename
        and not filename.startswith(".")
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

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
async def put_workspace_file(node_id: UUID, filename: str, request: WorkspaceFileRequest, db: AsyncSession = Depends(get_db)):
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    if filename not in _allowed_files_for_node(node):
        raise HTTPException(status_code=400, detail="File not allowed")
    await asyncio.to_thread(
        write_workspace_file, node.container_id, filename, request.content
    )
    return {"ok": True}


@router.get("/nodes/{node_id}/workspace")
async def list_node_workspace(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """List all files in a node's workspace directory."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    files = await asyncio.to_thread(list_workspace_files, node.container_id)
    if files is None:
        raise HTTPException(status_code=404, detail="Container not found")
    config = await asyncio.to_thread(read_nanobot_config, node.container_id)
    has_config = config is not None
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
    node_id: UUID, filename: str, request: WorkspaceFileRequest, db: AsyncSession = Depends(get_db),
):
    """Write any file to the workspace (no allowlist, just path safety)."""
    node = await db.get(Node, node_id)
    if not node or not node.container_id:
        raise HTTPException(status_code=404, detail="Node or container not found")
    if not _is_safe_filename(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    await asyncio.to_thread(
        write_workspace_file, node.container_id, filename, request.content
    )
    return {"ok": True}
