"""Edge CRUD for canvas connections."""

from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Edge, emit_event, get_db

router = APIRouter(tags=["edges"])


class EdgeCreate(BaseModel):
    source_id: UUID
    target_id: UUID
    edge_type: str = "connection"
    source_handle: str | None = None
    target_handle: str | None = None


class EdgeRead(BaseModel):
    id: UUID
    source_id: UUID
    target_id: UUID
    edge_type: str
    source_handle: str | None
    target_handle: str | None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


@router.post("/edges", response_model=EdgeRead)
async def create_edge(payload: EdgeCreate, db: AsyncSession = Depends(get_db)):
    edge = Edge(id=uuid4(), **payload.model_dump())
    db.add(edge)
    await db.commit()
    await db.refresh(edge)
    await emit_event("edge_created", summary="Edge created",
                     details={"source_id": str(payload.source_id), "target_id": str(payload.target_id)})
    return edge


@router.get("/edges", response_model=list[EdgeRead])
async def list_edges(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Edge))
    return result.scalars().all()


@router.delete("/edges/{edge_id}")
async def delete_edge(edge_id: UUID, db: AsyncSession = Depends(get_db)):
    edge = await db.get(Edge, edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    source_id = str(edge.source_id)
    target_id = str(edge.target_id)
    await db.delete(edge)
    await db.commit()
    await emit_event("edge_deleted", summary="Edge deleted",
                     details={"source_id": source_id, "target_id": target_id})
    return {"ok": True}
