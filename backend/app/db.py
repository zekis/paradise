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


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with async_session() as session:
        yield session
