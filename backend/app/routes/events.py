"""Event log API — list and clear persisted events, plus SSE stream."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.broadcast import broadcast
from app.db import EventLog, get_db

router = APIRouter(tags=["events"])


class EventLogRead(BaseModel):
    id: UUID
    event_type: str
    node_id: UUID | None
    node_name: str | None
    summary: str | None
    details: dict | None
    created_at: str | None

    model_config = {"from_attributes": True}


@router.get("/events", response_model=list[EventLogRead])
async def list_events(
    limit: int = Query(default=100, le=500),
    since: str | None = Query(default=None),
    node_id: UUID | None = Query(default=None),
    event_type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """List events, newest first. Use `since` (ISO timestamp) for incremental polling."""
    query = select(EventLog)
    if since:
        query = query.where(EventLog.created_at > since)
    if node_id:
        query = query.where(EventLog.node_id == node_id)
    if event_type:
        query = query.where(EventLog.event_type == event_type)
    query = query.order_by(EventLog.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.delete("/events")
async def clear_events(db: AsyncSession = Depends(get_db)):
    """Delete all event log entries."""
    await db.execute(delete(EventLog))
    await db.commit()
    return {"ok": True}


@router.get("/events/stream")
async def event_stream():
    """SSE stream for real-time node state updates (gauge, status, identity, rename)."""
    async def generate():
        async for msg in broadcast.subscribe():
            yield f"data: {msg}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
