"""Tests for app.routes.canvas — canvas viewport and settings endpoints."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routes.canvas import (
    CanvasViewport,
    DefaultConfigRequest,
    DefaultTemplatesRequest,
    get_canvas,
    get_default_config,
    get_default_templates,
    set_default_config,
    set_default_templates,
    update_canvas,
)

TEST_AREA_ID = uuid.uuid4()


# ---------------------------------------------------------------------------
# Pydantic model tests
# ---------------------------------------------------------------------------

class TestCanvasViewportModel:
    def test_defaults(self):
        vp = CanvasViewport()
        assert vp.viewport_x == 0.0
        assert vp.viewport_y == 0.0
        assert vp.zoom == 1.0

    def test_custom_values(self):
        vp = CanvasViewport(viewport_x=100.5, viewport_y=-50.0, zoom=2.5)
        assert vp.viewport_x == 100.5
        assert vp.viewport_y == -50.0
        assert vp.zoom == 2.5


class TestDefaultConfigRequest:
    def test_defaults_to_none(self):
        req = DefaultConfigRequest()
        assert req.config is None

    def test_with_config(self):
        req = DefaultConfigRequest(config={"model": "gpt-4"})
        assert req.config == {"model": "gpt-4"}


class TestDefaultTemplatesRequest:
    def test_defaults_to_none(self):
        req = DefaultTemplatesRequest()
        assert req.templates is None

    def test_with_templates(self):
        req = DefaultTemplatesRequest(templates={"SOUL.md": "# Soul"})
        assert req.templates == {"SOUL.md": "# Soul"}


# ---------------------------------------------------------------------------
# Route handler tests
# ---------------------------------------------------------------------------

class FakeCanvasState:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "default")
        self.viewport_x = kwargs.get("viewport_x", 0.0)
        self.viewport_y = kwargs.get("viewport_y", 0.0)
        self.zoom = kwargs.get("zoom", 1.0)
        self.default_nanobot_config = kwargs.get("default_nanobot_config", None)
        self.default_agent_templates = kwargs.get("default_agent_templates", None)


class TestGetCanvas:
    @pytest.mark.asyncio
    async def test_returns_existing_state(self):
        state = FakeCanvasState(viewport_x=10.0, viewport_y=20.0, zoom=1.5)
        db = AsyncMock()
        db.get = AsyncMock(return_value=state)

        result = await get_canvas(area_id=TEST_AREA_ID, db=db)

        assert result.viewport_x == 10.0
        assert result.viewport_y == 20.0
        assert result.zoom == 1.5

    @pytest.mark.asyncio
    async def test_creates_default_when_missing(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        db.add = MagicMock()
        db.commit = AsyncMock()
        # After refresh, simulate reading defaults from the newly created object
        async def fake_refresh(obj):
            obj.viewport_x = 0.0
            obj.viewport_y = 0.0
            obj.zoom = 1.0
        db.refresh = fake_refresh

        result = await get_canvas(area_id=TEST_AREA_ID, db=db)

        db.add.assert_called_once()
        assert result.viewport_x == 0.0
        assert result.zoom == 1.0


class TestUpdateCanvas:
    @pytest.mark.asyncio
    async def test_updates_existing_state(self):
        state = FakeCanvasState()
        db = AsyncMock()
        db.get = AsyncMock(return_value=state)
        db.commit = AsyncMock()

        payload = CanvasViewport(viewport_x=99.0, viewport_y=-10.0, zoom=3.0)
        result = await update_canvas(payload=payload, area_id=TEST_AREA_ID, db=db)

        assert state.viewport_x == 99.0
        assert state.viewport_y == -10.0
        assert state.zoom == 3.0
        assert result == payload

    @pytest.mark.asyncio
    async def test_creates_state_if_missing(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        db.add = MagicMock()
        db.commit = AsyncMock()

        payload = CanvasViewport(viewport_x=5.0, viewport_y=5.0, zoom=0.5)
        result = await update_canvas(payload=payload, area_id=TEST_AREA_ID, db=db)

        db.add.assert_called_once()
        assert result == payload


class TestGetDefaultConfig:
    @pytest.mark.asyncio
    async def test_returns_config_when_exists(self):
        state = FakeCanvasState(default_nanobot_config={"model": "gpt-4"})
        db = AsyncMock()
        db.get = AsyncMock(return_value=state)

        result = await get_default_config(area_id=TEST_AREA_ID, db=db)
        assert result == {"config": {"model": "gpt-4"}}

    @pytest.mark.asyncio
    async def test_returns_none_when_no_state(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        result = await get_default_config(area_id=TEST_AREA_ID, db=db)
        assert result == {"config": None}


class TestSetDefaultConfig:
    @pytest.mark.asyncio
    async def test_sets_config_on_existing_state(self):
        state = FakeCanvasState()
        db = AsyncMock()
        db.get = AsyncMock(return_value=state)
        db.commit = AsyncMock()

        request = DefaultConfigRequest(config={"model": "claude"})
        result = await set_default_config(request=request, area_id=TEST_AREA_ID, db=db)

        assert state.default_nanobot_config == {"model": "claude"}
        assert result == {"ok": True}

    @pytest.mark.asyncio
    async def test_creates_state_if_missing(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        db.add = MagicMock()
        db.commit = AsyncMock()

        request = DefaultConfigRequest(config={"model": "claude"})
        result = await set_default_config(request=request, area_id=TEST_AREA_ID, db=db)

        db.add.assert_called_once()
        assert result == {"ok": True}


class TestGetDefaultTemplates:
    @pytest.mark.asyncio
    async def test_returns_templates_when_exists(self):
        state = FakeCanvasState(default_agent_templates={"SOUL.md": "# Custom"})
        db = AsyncMock()
        db.get = AsyncMock(return_value=state)

        result = await get_default_templates(area_id=TEST_AREA_ID, db=db)
        assert result == {"templates": {"SOUL.md": "# Custom"}}

    @pytest.mark.asyncio
    async def test_returns_none_when_no_templates(self):
        state = FakeCanvasState(default_agent_templates=None)
        db = AsyncMock()
        db.get = AsyncMock(return_value=state)

        result = await get_default_templates(area_id=TEST_AREA_ID, db=db)
        assert result == {"templates": None}

    @pytest.mark.asyncio
    async def test_returns_none_when_no_state(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        result = await get_default_templates(area_id=TEST_AREA_ID, db=db)
        assert result == {"templates": None}


class TestSetDefaultTemplates:
    @pytest.mark.asyncio
    async def test_sets_templates(self):
        state = FakeCanvasState()
        db = AsyncMock()
        db.get = AsyncMock(return_value=state)
        db.commit = AsyncMock()

        request = DefaultTemplatesRequest(templates={"SOUL.md": "# New Soul"})
        result = await set_default_templates(request=request, area_id=TEST_AREA_ID, db=db)

        assert state.default_agent_templates == {"SOUL.md": "# New Soul"}
        assert result == {"ok": True}

    @pytest.mark.asyncio
    async def test_clears_templates_with_none(self):
        state = FakeCanvasState(default_agent_templates={"SOUL.md": "old"})
        db = AsyncMock()
        db.get = AsyncMock(return_value=state)
        db.commit = AsyncMock()

        request = DefaultTemplatesRequest(templates=None)
        result = await set_default_templates(request=request, area_id=TEST_AREA_ID, db=db)

        assert state.default_agent_templates is None
        assert result == {"ok": True}
