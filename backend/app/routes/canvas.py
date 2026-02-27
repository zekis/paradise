"""Canvas viewport state."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import CanvasState, get_db

router = APIRouter(tags=["canvas"])


class CanvasViewport(BaseModel):
    viewport_x: float = 0.0
    viewport_y: float = 0.0
    zoom: float = 1.0


@router.get("/canvas", response_model=CanvasViewport)
async def get_canvas(db: AsyncSession = Depends(get_db)):
    state = await db.get(CanvasState, "default")
    if not state:
        state = CanvasState(id="default")
        db.add(state)
        await db.commit()
        await db.refresh(state)
    return CanvasViewport(
        viewport_x=state.viewport_x,
        viewport_y=state.viewport_y,
        zoom=state.zoom,
    )


@router.patch("/canvas", response_model=CanvasViewport)
async def update_canvas(payload: CanvasViewport, db: AsyncSession = Depends(get_db)):
    state = await db.get(CanvasState, "default")
    if not state:
        state = CanvasState(id="default")
        db.add(state)
    state.viewport_x = payload.viewport_x
    state.viewport_y = payload.viewport_y
    state.zoom = payload.zoom
    await db.commit()
    return payload


@router.get("/settings/default-config")
async def get_default_config(db: AsyncSession = Depends(get_db)):
    state = await db.get(CanvasState, "default")
    if not state:
        return {"config": None}
    return {"config": state.default_nanobot_config}


@router.put("/settings/default-config")
async def set_default_config(payload: dict, db: AsyncSession = Depends(get_db)):
    state = await db.get(CanvasState, "default")
    if not state:
        state = CanvasState(id="default")
        db.add(state)
    state.default_nanobot_config = payload.get("config")
    await db.commit()
    return {"ok": True}


@router.get("/settings/default-templates")
async def get_default_templates(db: AsyncSession = Depends(get_db)):
    state = await db.get(CanvasState, "default")
    if not state or not state.default_agent_templates:
        return {"templates": None}
    return {"templates": state.default_agent_templates}


@router.put("/settings/default-templates")
async def set_default_templates(payload: dict, db: AsyncSession = Depends(get_db)):
    state = await db.get(CanvasState, "default")
    if not state:
        state = CanvasState(id="default")
        db.add(state)
    state.default_agent_templates = payload.get("templates")
    await db.commit()
    return {"ok": True}
