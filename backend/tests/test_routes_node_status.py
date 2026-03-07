"""Tests for app.routes.node_status — archive, resume, restart/rebuild guards."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.routes.node_status import archive_node, resume_node, restart_node, rebuild_node


# ---------------------------------------------------------------------------
# Fake model helper
# ---------------------------------------------------------------------------

class FakeNode:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.name = kwargs.get("name", "test-node")
        self.container_id = kwargs.get("container_id", "c123")
        self.container_status = kwargs.get("container_status", "running")
        self.config = kwargs.get("config", None)
        self.identity = kwargs.get("identity", None)
        self.archived = kwargs.get("archived", False)
        self.agent_status = kwargs.get("agent_status", None)
        self.agent_status_message = kwargs.get("agent_status_message", None)
        self.gauge_value = kwargs.get("gauge_value", None)
        self.gauge_label = kwargs.get("gauge_label", None)
        self.gauge_unit = kwargs.get("gauge_unit", None)
        self.gauge_warn_threshold = kwargs.get("gauge_warn_threshold", None)
        self.gauge_critical_threshold = kwargs.get("gauge_critical_threshold", None)


# ---------------------------------------------------------------------------
# Archive endpoint
# ---------------------------------------------------------------------------

class TestArchiveNode:
    @pytest.mark.asyncio
    async def test_archives_running_node(self):
        node = FakeNode(container_id="c123", archived=False)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()

        with patch("app.routes.node_status.stop_nanobot_container") as mock_stop, \
             patch("app.routes.node_status.emit_event", new_callable=AsyncMock), \
             patch("app.routes.node_status.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            result = await archive_node(node_id=node.id, db=db)

        mock_stop.assert_called_once_with("c123")
        assert node.archived is True
        assert node.container_status == "archived"
        assert node.container_id is None
        assert result == {"ok": True}

    @pytest.mark.asyncio
    async def test_archives_node_without_container(self):
        node = FakeNode(container_id=None, archived=False)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()

        with patch("app.routes.node_status.stop_nanobot_container") as mock_stop, \
             patch("app.routes.node_status.emit_event", new_callable=AsyncMock), \
             patch("app.routes.node_status.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            result = await archive_node(node_id=node.id, db=db)

        mock_stop.assert_not_called()
        assert node.archived is True
        assert result == {"ok": True}

    @pytest.mark.asyncio
    async def test_rejects_already_archived(self):
        node = FakeNode(archived=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)

        with pytest.raises(HTTPException) as exc_info:
            await archive_node(node_id=node.id, db=db)
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await archive_node(node_id=uuid.uuid4(), db=db)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_broadcasts_archived_event(self):
        node = FakeNode(container_id="c123", archived=False)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()

        with patch("app.routes.node_status.stop_nanobot_container"), \
             patch("app.routes.node_status.emit_event", new_callable=AsyncMock), \
             patch("app.routes.node_status.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await archive_node(node_id=node.id, db=db)

        mock_broadcast.publish.assert_awaited_once()
        call_args = mock_broadcast.publish.call_args
        assert call_args[0][0] == "node_archived"
        assert call_args[0][1]["archived"] is True


# ---------------------------------------------------------------------------
# Resume endpoint
# ---------------------------------------------------------------------------

class TestResumeNode:
    @pytest.mark.asyncio
    async def test_resumes_archived_node(self):
        node = FakeNode(container_id=None, archived=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()

        with patch("app.routes.node_status.recreate_container", new_callable=AsyncMock) as mock_recreate, \
             patch("app.routes.node_status.emit_event", new_callable=AsyncMock), \
             patch("app.routes.node_status.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            result = await resume_node(node_id=node.id, db=db)

        mock_recreate.assert_awaited_once()
        assert node.archived is False
        assert result == {"ok": True}

    @pytest.mark.asyncio
    async def test_rejects_non_archived(self):
        node = FakeNode(archived=False)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)

        with pytest.raises(HTTPException) as exc_info:
            await resume_node(node_id=node.id, db=db)
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await resume_node(node_id=uuid.uuid4(), db=db)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_handles_recreate_failure(self):
        node = FakeNode(container_id=None, archived=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()

        with patch("app.routes.node_status.recreate_container", new_callable=AsyncMock, side_effect=RuntimeError("docker fail")), \
             patch("app.routes.node_status.emit_event", new_callable=AsyncMock):
            with pytest.raises(HTTPException) as exc_info:
                await resume_node(node_id=node.id, db=db)
            assert exc_info.value.status_code == 500

        assert node.container_status == "error"

    @pytest.mark.asyncio
    async def test_broadcasts_resumed_event(self):
        node = FakeNode(container_id=None, archived=True, container_status="archived")
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()

        with patch("app.routes.node_status.recreate_container", new_callable=AsyncMock), \
             patch("app.routes.node_status.emit_event", new_callable=AsyncMock), \
             patch("app.routes.node_status.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            await resume_node(node_id=node.id, db=db)

        mock_broadcast.publish.assert_awaited_once()
        call_args = mock_broadcast.publish.call_args
        assert call_args[0][0] == "node_resumed"
        assert call_args[0][1]["archived"] is False


# ---------------------------------------------------------------------------
# Restart/Rebuild guards for archived nodes
# ---------------------------------------------------------------------------

class TestRestartGuard:
    @pytest.mark.asyncio
    async def test_rejects_archived_node(self):
        node = FakeNode(archived=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)

        with pytest.raises(HTTPException) as exc_info:
            await restart_node(node_id=node.id, db=db)
        assert exc_info.value.status_code == 400
        assert "archived" in exc_info.value.detail.lower()


class TestRebuildGuard:
    @pytest.mark.asyncio
    async def test_rejects_archived_node(self):
        node = FakeNode(archived=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)

        with pytest.raises(HTTPException) as exc_info:
            await rebuild_node(node_id=node.id, db=db)
        assert exc_info.value.status_code == 400
        assert "archived" in exc_info.value.detail.lower()
