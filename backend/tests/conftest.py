"""Shared fixtures for Paradise backend tests.

All tests run with mocked DB and Docker — no real connections required.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Event-loop fixture for pytest-asyncio
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop():
    """Create a single event loop for all async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ---------------------------------------------------------------------------
# Fake DB session
# ---------------------------------------------------------------------------

class FakeAsyncSession:
    """In-memory session double that tracks added/deleted objects and
    supports ``await db.get(Model, pk)`` via a pre-loaded store.
    """

    def __init__(self, store: dict | None = None):
        # store maps (ModelClass, primary_key) -> instance
        self._store: dict[tuple, object] = store or {}
        self._added: list[object] = []
        self._deleted: list[object] = []

    # -- context manager --
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    # -- core operations --
    async def get(self, model_class, pk):
        return self._store.get((model_class, pk))

    def add(self, obj):
        self._added.append(obj)

    async def delete(self, obj):
        self._deleted.append(obj)

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def execute(self, stmt):
        """Return a result-like object. Override per-test via monkeypatch."""
        return FakeResult([])


class FakeResult:
    """Mimics SQLAlchemy result with `.scalars().all()` and `.scalars().first()`."""

    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


@pytest.fixture
def fake_db():
    """Return a fresh FakeAsyncSession."""
    return FakeAsyncSession()


# ---------------------------------------------------------------------------
# Helper to build Node-like objects (plain objects, not ORM)
# ---------------------------------------------------------------------------

class FakeNode:
    """Lightweight stand-in for ``app.db.Node`` that avoids SQLAlchemy overhead."""

    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.name = kwargs.get("name", "test-node")
        self.container_id = kwargs.get("container_id", "abc123")
        self.container_status = kwargs.get("container_status", "running")
        self.position_x = kwargs.get("position_x", 0.0)
        self.position_y = kwargs.get("position_y", 0.0)
        self.width = kwargs.get("width", 320.0)
        self.height = kwargs.get("height", 400.0)
        self.config = kwargs.get("config", None)
        self.identity = kwargs.get("identity", None)
        self.agent_status = kwargs.get("agent_status", None)
        self.agent_status_message = kwargs.get("agent_status_message", None)
        self.gauge_value = kwargs.get("gauge_value", None)
        self.gauge_label = kwargs.get("gauge_label", None)
        self.gauge_unit = kwargs.get("gauge_unit", None)
        self.created_at = kwargs.get("created_at", datetime.now(timezone.utc))
        self.updated_at = kwargs.get("updated_at", datetime.now(timezone.utc))
        self.area_id = kwargs.get("area_id", None)
        self.edges_out = kwargs.get("edges_out", [])
        self.edges_in = kwargs.get("edges_in", [])


class FakeEdge:
    """Lightweight stand-in for ``app.db.Edge``."""

    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.source_id = kwargs.get("source_id", uuid.uuid4())
        self.target_id = kwargs.get("target_id", uuid.uuid4())
        self.edge_type = kwargs.get("edge_type", "connection")
        self.source_handle = kwargs.get("source_handle", None)
        self.target_handle = kwargs.get("target_handle", None)
        self.chat_enabled = kwargs.get("chat_enabled", False)
        self.created_at = kwargs.get("created_at", datetime.now(timezone.utc))


class FakeCanvasState:
    """Stand-in for ``app.db.CanvasState``."""

    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "default")
        self.viewport_x = kwargs.get("viewport_x", 0.0)
        self.viewport_y = kwargs.get("viewport_y", 0.0)
        self.zoom = kwargs.get("zoom", 1.0)
        self.default_nanobot_config = kwargs.get("default_nanobot_config", None)
        self.default_agent_templates = kwargs.get("default_agent_templates", None)


@pytest.fixture
def make_node():
    """Factory fixture: call ``make_node(name="foo")`` to get a FakeNode."""
    def _factory(**kwargs):
        return FakeNode(**kwargs)
    return _factory


@pytest.fixture
def make_edge():
    """Factory fixture for FakeEdge."""
    def _factory(**kwargs):
        return FakeEdge(**kwargs)
    return _factory


@pytest.fixture
def make_canvas_state():
    """Factory fixture for FakeCanvasState."""
    def _factory(**kwargs):
        return FakeCanvasState(**kwargs)
    return _factory
