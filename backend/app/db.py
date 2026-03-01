"""Database setup and models."""

import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://paradise:paradise@localhost:5432/paradise"
)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Node(Base):
    __tablename__ = "nodes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False, default="new-nanobot")
    container_id = Column(String(80), nullable=True)
    container_status = Column(String(20), nullable=True, default="pending")
    position_x = Column(Float, nullable=False, default=0.0)
    position_y = Column(Float, nullable=False, default=0.0)
    width = Column(Float, nullable=False, default=320.0)
    height = Column(Float, nullable=False, default=400.0)
    config = Column(JSONB, nullable=True)
    identity = Column(JSONB, nullable=True)
    agent_status = Column(String(20), nullable=True)  # ok, warning, error
    agent_status_message = Column(Text, nullable=True)
    gauge_value = Column(Float, nullable=True)
    gauge_label = Column(Text, nullable=True)
    created_at = Column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at = Column(
        String, default=lambda: datetime.now(timezone.utc).isoformat(),
        onupdate=lambda: datetime.now(timezone.utc).isoformat(),
    )

    edges_out = relationship("Edge", foreign_keys="Edge.source_id", back_populates="source", cascade="all, delete-orphan")
    edges_in = relationship("Edge", foreign_keys="Edge.target_id", back_populates="target", cascade="all, delete-orphan")


class Edge(Base):
    __tablename__ = "edges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    target_id = Column(UUID(as_uuid=True), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    edge_type = Column(String(30), default="connection")
    source_handle = Column(String(30), nullable=True)
    target_handle = Column(String(30), nullable=True)
    created_at = Column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    source = relationship("Node", foreign_keys=[source_id], back_populates="edges_out")
    target = relationship("Node", foreign_keys=[target_id], back_populates="edges_in")


class CanvasState(Base):
    __tablename__ = "canvas_state"

    id = Column(String, primary_key=True, default="default")
    viewport_x = Column(Float, default=0.0)
    viewport_y = Column(Float, default=0.0)
    zoom = Column(Float, default=1.0)
    default_nanobot_config = Column(JSONB, nullable=True)
    default_agent_templates = Column(JSONB, nullable=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id = Column(UUID(as_uuid=True), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    message_type = Column(String(20), nullable=True, default="chat")
    display_content = Column(Text, nullable=True)
    created_at = Column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )


class EventLog(Base):
    __tablename__ = "event_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type = Column(String(40), nullable=False, index=True)
    node_id = Column(UUID(as_uuid=True), ForeignKey("nodes.id", ondelete="SET NULL"), nullable=True, index=True)
    node_name = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    details = Column(JSONB, nullable=True)
    created_at = Column(
        String, default=lambda: datetime.now(timezone.utc).isoformat(), index=True
    )


async def emit_event(
    event_type: str,
    node_id: "uuid.UUID | None" = None,
    node_name: str | None = None,
    summary: str | None = None,
    details: dict | None = None,
) -> None:
    """Fire-and-forget helper to persist an event log entry."""
    try:
        async with async_session() as db:
            db.add(EventLog(
                event_type=event_type,
                node_id=node_id,
                node_name=node_name,
                summary=summary,
                details=details,
            ))
            await db.commit()
    except Exception:
        pass  # Never let event logging break the caller


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Migrate existing tables (add columns that may not exist yet)
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS identity JSONB"))
        await conn.execute(text("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_status VARCHAR(20)"))
        await conn.execute(text("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_status_message TEXT"))
        await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'chat'"))
        await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS display_content TEXT"))
        await conn.execute(text("ALTER TABLE edges ADD COLUMN IF NOT EXISTS source_handle VARCHAR(30)"))
        await conn.execute(text("ALTER TABLE edges ADD COLUMN IF NOT EXISTS target_handle VARCHAR(30)"))
        await conn.execute(text("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS gauge_value DOUBLE PRECISION"))
        await conn.execute(text("ALTER TABLE nodes ADD COLUMN IF NOT EXISTS gauge_label TEXT"))


async def get_db():
    async with async_session() as session:
        yield session
