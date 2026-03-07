"""Area CRUD and node-move operations."""

from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Area, CanvasState, Edge, Node, emit_event, get_db

router = APIRouter(tags=["areas"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AreaCreate(BaseModel):
    name: str = "New Area"


class AreaUpdate(BaseModel):
    name: str | None = None
    sort_order: float | None = None


class AreaRead(BaseModel):
    id: UUID
    name: str
    sort_order: float
    node_count: int = 0
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class MoveNodeRequest(BaseModel):
    node_id: UUID


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/areas", response_model=list[AreaRead])
async def list_areas(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            Area,
            func.count(Node.id).label("node_count"),
        )
        .outerjoin(Node, Node.area_id == Area.id)
        .group_by(Area.id)
        .order_by(Area.sort_order)
    )
    rows = result.all()
    return [
        AreaRead(
            id=area.id,
            name=area.name,
            sort_order=area.sort_order,
            node_count=count,
            created_at=area.created_at,
        )
        for area, count in rows
    ]


@router.post("/areas", response_model=AreaRead)
async def create_area(payload: AreaCreate, db: AsyncSession = Depends(get_db)):
    # Determine next sort_order
    result = await db.execute(
        select(func.coalesce(func.max(Area.sort_order), -1.0))
    )
    max_order = result.scalar() or 0.0
    area = Area(id=uuid4(), name=payload.name, sort_order=max_order + 1.0)
    db.add(area)

    # Create a CanvasState row for the new area
    db.add(CanvasState(id=str(area.id)))

    await db.commit()
    await db.refresh(area)
    await emit_event("area_created", summary=f'Area "{area.name}" created')
    return AreaRead(
        id=area.id,
        name=area.name,
        sort_order=area.sort_order,
        node_count=0,
        created_at=area.created_at,
    )


@router.patch("/areas/{area_id}", response_model=AreaRead)
async def update_area(area_id: UUID, payload: AreaUpdate, db: AsyncSession = Depends(get_db)):
    area = await db.get(Area, area_id)
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    if payload.name is not None:
        area.name = payload.name
    if payload.sort_order is not None:
        area.sort_order = payload.sort_order
    await db.commit()
    await db.refresh(area)

    # Count nodes
    count_result = await db.execute(
        select(func.count(Node.id)).where(Node.area_id == area.id)
    )
    node_count = count_result.scalar() or 0

    return AreaRead(
        id=area.id,
        name=area.name,
        sort_order=area.sort_order,
        node_count=node_count,
        created_at=area.created_at,
    )


@router.delete("/areas/{area_id}")
async def delete_area(
    area_id: UUID,
    move_to: UUID = Query(..., description="Target area to move nodes to"),
    db: AsyncSession = Depends(get_db),
):
    area = await db.get(Area, area_id)
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    # Must not be the last area
    count_result = await db.execute(select(func.count(Area.id)))
    area_count = count_result.scalar() or 0
    if area_count <= 1:
        raise HTTPException(status_code=409, detail="Cannot delete the last area")

    # Validate target area
    if move_to == area_id:
        raise HTTPException(status_code=400, detail="Cannot move nodes to the area being deleted")
    target = await db.get(Area, move_to)
    if not target:
        raise HTTPException(status_code=400, detail="Target area not found")

    area_name = area.name

    # Move nodes to target area
    await db.execute(
        Node.__table__.update()
        .where(Node.area_id == area_id)
        .values(area_id=move_to)
    )

    # Delete the area's CanvasState
    canvas_state = await db.get(CanvasState, str(area_id))
    if canvas_state:
        await db.delete(canvas_state)

    await db.delete(area)
    await db.commit()
    await emit_event("area_deleted", summary=f'Area "{area_name}" deleted, nodes moved to "{target.name}"')
    return {"ok": True}


@router.post("/areas/{area_id}/move-node")
async def move_node_to_area(
    area_id: UUID,
    payload: MoveNodeRequest,
    db: AsyncSession = Depends(get_db),
):
    target_area = await db.get(Area, area_id)
    if not target_area:
        raise HTTPException(status_code=404, detail="Target area not found")

    node = await db.get(Node, payload.node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    if node.area_id == area_id:
        return {"ok": True, "message": "Node already in this area"}

    old_area_id = node.area_id

    # Delete edges that connect this node to nodes in the old area
    if old_area_id:
        # Edges where this node is source and target is in the old area
        await db.execute(
            delete(Edge).where(
                Edge.source_id == node.id,
                Edge.target_id.in_(
                    select(Node.id).where(Node.area_id == old_area_id, Node.id != node.id)
                ),
            )
        )
        # Edges where this node is target and source is in the old area
        await db.execute(
            delete(Edge).where(
                Edge.target_id == node.id,
                Edge.source_id.in_(
                    select(Node.id).where(Node.area_id == old_area_id, Node.id != node.id)
                ),
            )
        )

    node.area_id = area_id
    await db.commit()
    await emit_event(
        "node_moved_area",
        node_id=node.id,
        node_name=node.name,
        summary=f'Node "{node.name}" moved to area "{target_area.name}"',
    )
    return {"ok": True}
