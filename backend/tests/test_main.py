"""Tests for app.main — lifespan, maintenance helpers, healthz, _sync_node_gauge."""

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.main import (
    _check_container_statuses,
    _refresh_identities,
    _sync_node_gauge,
    healthz,
)


# ---------------------------------------------------------------------------
# Fake model helpers
# ---------------------------------------------------------------------------

class FakeNode:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.name = kwargs.get("name", "test-node")
        self.container_id = kwargs.get("container_id", "c123")
        self.container_status = kwargs.get("container_status", "running")
        self.identity = kwargs.get("identity", None)
        self.gauge_value = kwargs.get("gauge_value", None)
        self.gauge_label = kwargs.get("gauge_label", None)
        self.gauge_unit = kwargs.get("gauge_unit", None)
        self.archived = kwargs.get("archived", False)
        self.area_id = kwargs.get("area_id", None)


# ---------------------------------------------------------------------------
# healthz
# ---------------------------------------------------------------------------

class TestHealthz:
    @pytest.mark.asyncio
    async def test_returns_ok(self):
        result = await healthz()
        assert result == {"status": "ok"}


# ---------------------------------------------------------------------------
# _sync_node_gauge
# ---------------------------------------------------------------------------

class TestSyncNodeGauge:
    @pytest.mark.asyncio
    async def test_sets_gauge_from_flat_dict(self):
        node = FakeNode()

        with patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _sync_node_gauge(node, {
                "gauge_value": 75.0,
                "gauge_label": "CPU",
                "gauge_unit": "%",
            })

        assert node.gauge_value == 75.0
        assert node.gauge_label == "CPU"
        assert node.gauge_unit == "%"

    @pytest.mark.asyncio
    async def test_sets_gauge_from_nested_dict(self):
        node = FakeNode()

        with patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _sync_node_gauge(node, {
                "gauge": {
                    "value": 50.0,
                    "label": "Memory",
                    "unit": "MB",
                },
            })

        assert node.gauge_value == 50.0
        assert node.gauge_label == "Memory"
        assert node.gauge_unit == "MB"

    @pytest.mark.asyncio
    async def test_clears_gauge_when_value_none(self):
        node = FakeNode(gauge_value=50.0, gauge_label="old", gauge_unit="u")

        with patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _sync_node_gauge(node, {"gauge_value": None})

        assert node.gauge_value is None
        assert node.gauge_label is None
        assert node.gauge_unit is None

    @pytest.mark.asyncio
    async def test_ignores_invalid_gauge_value(self):
        node = FakeNode()

        with patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _sync_node_gauge(node, {"gauge_value": "not a number"})

        assert node.gauge_value is None

    @pytest.mark.asyncio
    async def test_ignores_out_of_range_value(self):
        node = FakeNode()

        with patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _sync_node_gauge(node, {"gauge_value": 150.0})

        assert node.gauge_value is None  # 150 is out of 0-100 range

    @pytest.mark.asyncio
    async def test_broadcasts_on_change(self):
        node = FakeNode(gauge_value=None)

        with patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _sync_node_gauge(node, {"gauge_value": 42.0})

        mock_broadcast.publish.assert_awaited_once()
        call_args = mock_broadcast.publish.call_args
        assert call_args[0][0] == "gauge"
        assert call_args[0][1]["gauge_value"] == 42.0

    @pytest.mark.asyncio
    async def test_no_broadcast_when_unchanged(self):
        node = FakeNode(gauge_value=42.0)

        with patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _sync_node_gauge(node, {"gauge_value": 42.0})

        mock_broadcast.publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_noop_when_no_gauge_key(self):
        node = FakeNode(gauge_value=10.0)

        with patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _sync_node_gauge(node, {"other_field": "irrelevant"})

        assert node.gauge_value == 10.0  # unchanged
        mock_broadcast.publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_truncates_label_and_unit(self):
        node = FakeNode()

        with patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _sync_node_gauge(node, {
                "gauge_value": 10.0,
                "gauge_label": "x" * 200,
                "gauge_unit": "y" * 50,
            })

        assert len(node.gauge_label) <= 100
        assert len(node.gauge_unit) <= 20


# ---------------------------------------------------------------------------
# _check_container_statuses
# ---------------------------------------------------------------------------

class TestCheckContainerStatuses:
    @pytest.mark.asyncio
    async def test_updates_changed_status(self):
        node = FakeNode(container_status="running", container_id="c1")
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.main.get_container_status", return_value="exited"), \
             patch("app.main.emit_event", new_callable=AsyncMock), \
             patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _check_container_statuses([node], db)

        assert node.container_status == "exited"
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_no_update_when_unchanged(self):
        node = FakeNode(container_status="running", container_id="c1")
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.main.get_container_status", return_value="running"), \
             patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _check_container_statuses([node], db)

        # Status unchanged, broadcast should NOT be called
        mock_broadcast.publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_broadcasts_status_change(self):
        node = FakeNode(container_status="running", container_id="c1")
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.main.get_container_status", return_value="exited"), \
             patch("app.main.emit_event", new_callable=AsyncMock), \
             patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _check_container_statuses([node], db)

        mock_broadcast.publish.assert_awaited_once()
        call_args = mock_broadcast.publish.call_args
        assert call_args[0][0] == "container_status"
        assert call_args[0][1]["container_status"] == "exited"


# ---------------------------------------------------------------------------
# _refresh_identities
# ---------------------------------------------------------------------------

class TestRefreshIdentities:
    @pytest.mark.asyncio
    async def test_updates_identity_on_change(self):
        node = FakeNode(container_id="c1", identity=None)
        new_identity = {"name": "test-node", "bio": "updated"}

        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.main.read_workspace_file", return_value=json.dumps(new_identity)), \
             patch("app.main.sync_identity_name", new_callable=AsyncMock, return_value=new_identity), \
             patch("app.main.emit_event", new_callable=AsyncMock), \
             patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _refresh_identities([node], db)

        assert node.identity == new_identity
        mock_broadcast.publish.assert_awaited()

    @pytest.mark.asyncio
    async def test_skips_node_with_no_content(self):
        node = FakeNode(container_id="c1", identity=None)
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.main.read_workspace_file", return_value=None), \
             patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _refresh_identities([node], db)

        assert node.identity is None

    @pytest.mark.asyncio
    async def test_skips_malformed_json(self):
        node = FakeNode(container_id="c1", identity=None)
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.main.read_workspace_file", return_value="not json{{{"), \
             patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _refresh_identities([node], db)

        assert node.identity is None

    @pytest.mark.asyncio
    async def test_skips_exceptions_from_read(self):
        node = FakeNode(container_id="c1", identity=None)
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.main.read_workspace_file", side_effect=RuntimeError("boom")), \
             patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _refresh_identities([node], db)

        assert node.identity is None

    @pytest.mark.asyncio
    async def test_no_broadcast_when_identity_unchanged(self):
        existing = {"name": "test-node", "bio": "same"}
        node = FakeNode(container_id="c1", identity=existing)
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.main.read_workspace_file", return_value=json.dumps(existing)), \
             patch("app.main.sync_identity_name", new_callable=AsyncMock, return_value=existing), \
             patch("app.main.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await _refresh_identities([node], db)

        # Identity didn't change so no broadcast
        mock_broadcast.publish.assert_not_awaited()
