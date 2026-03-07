"""Edge CRUD for canvas connections."""

from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.broadcast import broadcast
from app.db import Edge, Node, emit_event, get_db

router = APIRouter(tags=["edges"])


class EdgeCreate(BaseModel):
    source_id: UUID
    target_id: UUID
    edge_type: str = "connection"
    source_handle: str | None = None
    target_handle: str | None = None


class EdgePatch(BaseModel):
    chat_enabled: bool | None = None


class EdgeRead(BaseModel):
    id: UUID
    source_id: UUID
    target_id: UUID
    edge_type: str
    source_handle: str | None
    target_handle: str | None
    chat_enabled: bool
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


@router.post("/edges", response_model=EdgeRead)
async def create_edge(payload: EdgeCreate, db: AsyncSession = Depends(get_db)):
    # Validate both nodes are in the same area
    source_node = await db.get(Node, payload.source_id)
    target_node = await db.get(Node, payload.target_id)
    if not source_node or not target_node:
        raise HTTPException(status_code=404, detail="Source or target node not found")
    if source_node.area_id != target_node.area_id:
        raise HTTPException(status_code=400, detail="Cannot create edge between nodes in different areas")

    edge = Edge(id=uuid4(), **payload.model_dump())
    db.add(edge)
    await db.commit()
    await db.refresh(edge)
    await emit_event("edge_created", summary="Edge created",
                     details={"source_id": str(payload.source_id), "target_id": str(payload.target_id)})
    return edge


@router.get("/edges", response_model=list[EdgeRead])
async def list_edges(
    area_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    if area_id:
        # Only return edges where both source and target are in the given area
        from sqlalchemy.orm import aliased
        source_node = aliased(Node)
        target_node = aliased(Node)
        query = (
            select(Edge)
            .join(source_node, Edge.source_id == source_node.id)
            .join(target_node, Edge.target_id == target_node.id)
            .where(source_node.area_id == area_id, target_node.area_id == area_id)
        )
        result = await db.execute(query)
    else:
        result = await db.execute(select(Edge))
    return result.scalars().all()


@router.patch("/edges/{edge_id}", response_model=EdgeRead)
async def patch_edge(edge_id: UUID, payload: EdgePatch, db: AsyncSession = Depends(get_db)):
    edge = await db.get(Edge, edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    if payload.chat_enabled is not None:
        edge.chat_enabled = payload.chat_enabled
    await db.commit()
    await db.refresh(edge)
    await broadcast.publish("edge_chat_toggled", {
        "edge_id": str(edge_id),
        "chat_enabled": edge.chat_enabled,
    })
    await emit_event("edge_chat_toggled", summary=f"Chat {'enabled' if edge.chat_enabled else 'disabled'}",
                     details={"edge_id": str(edge_id), "source_id": str(edge.source_id),
                              "target_id": str(edge.target_id)})
    return edge


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
