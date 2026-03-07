"""Canvas viewport state."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Area, CanvasState, get_db

router = APIRouter(tags=["canvas"])


class CanvasViewport(BaseModel):
    viewport_x: float = 0.0
    viewport_y: float = 0.0
    zoom: float = 1.0


class DefaultConfigRequest(BaseModel):
    config: dict[str, Any] | None = None


class DefaultTemplatesRequest(BaseModel):
    templates: dict[str, str] | None = None


async def _resolve_canvas_key(area_id: UUID | None, db: AsyncSession) -> str:
    """Resolve the CanvasState key for the given area_id, or fall back to the first area."""
    if area_id:
        return str(area_id)
    # Fall back to first area
    result = await db.execute(select(Area).order_by(Area.sort_order).limit(1))
    first_area = result.scalars().first()
    if first_area:
        return str(first_area.id)
    return "default"


@router.get("/canvas", response_model=CanvasViewport)
async def get_canvas(area_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    key = await _resolve_canvas_key(area_id, db)
    state = await db.get(CanvasState, key)
    if not state:
        state = CanvasState(id=key)
        db.add(state)
        await db.commit()
        await db.refresh(state)
    return CanvasViewport(
        viewport_x=state.viewport_x,
        viewport_y=state.viewport_y,
        zoom=state.zoom,
    )


@router.patch("/canvas", response_model=CanvasViewport)
async def update_canvas(payload: CanvasViewport, area_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    key = await _resolve_canvas_key(area_id, db)
    state = await db.get(CanvasState, key)
    if not state:
        state = CanvasState(id=key)
        db.add(state)
    state.viewport_x = payload.viewport_x
    state.viewport_y = payload.viewport_y
    state.zoom = payload.zoom
    await db.commit()
    return payload


@router.get("/settings/default-config")
async def get_default_config(area_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    key = await _resolve_canvas_key(area_id, db)
    state = await db.get(CanvasState, key)
    if not state:
        return {"config": None}
    return {"config": state.default_nanobot_config}


@router.put("/settings/default-config")
async def set_default_config(request: DefaultConfigRequest, area_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    key = await _resolve_canvas_key(area_id, db)
    state = await db.get(CanvasState, key)
    if not state:
        state = CanvasState(id=key)
        db.add(state)
    state.default_nanobot_config = request.config
    await db.commit()
    return {"ok": True}


@router.get("/settings/default-templates")
async def get_default_templates(area_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    key = await _resolve_canvas_key(area_id, db)
    state = await db.get(CanvasState, key)
    if not state or not state.default_agent_templates:
        return {"templates": None}
    return {"templates": state.default_agent_templates}


@router.put("/settings/default-templates")
async def set_default_templates(request: DefaultTemplatesRequest, area_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    key = await _resolve_canvas_key(area_id, db)
    state = await db.get(CanvasState, key)
    if not state:
        state = CanvasState(id=key)
        db.add(state)
    state.default_agent_templates = request.templates
    await db.commit()
    return {"ok": True}
