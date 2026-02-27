"""Edge CRUD for canvas connections."""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Edge, get_db

router = APIRouter(tags=["edges"])


class EdgeCreate(BaseModel):
    source_id: UUID
    target_id: UUID
    edge_type: str = "connection"


class EdgeRead(BaseModel):
    id: UUID
    source_id: UUID
    target_id: UUID
    edge_type: str
    created_at: str | None

    model_config = {"from_attributes": True}


@router.post("/edges", response_model=EdgeRead)
async def create_edge(payload: EdgeCreate, db: AsyncSession = Depends(get_db)):
    edge = Edge(id=uuid4(), **payload.model_dump())
    db.add(edge)
    await db.commit()
    await db.refresh(edge)
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
    await db.delete(edge)
    await db.commit()
    return {"ok": True}
