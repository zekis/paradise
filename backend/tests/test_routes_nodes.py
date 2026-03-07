"""Tests for app.routes.nodes — node CRUD, cloning, config endpoints."""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.routes.nodes import (
    CloneNodeRequest,
    NodeCreate,
    NodeRead,
    NodeUpdate,
    UpdateNodeConfigRequest,
    _sync_identity_name,
    create_node,
    delete_node,
    get_node,
    get_node_config,
    list_nodes,
    update_node,
    update_node_config,
)


# ---------------------------------------------------------------------------
# Pydantic model tests
# ---------------------------------------------------------------------------

class TestNodeCreateModel:
    def test_defaults(self):
        nc = NodeCreate()
        assert nc.name == "new-nanobot"
        assert nc.position_x == 0.0
        assert nc.position_y == 0.0

    def test_custom(self):
        nc = NodeCreate(name="my-bot", position_x=10.0, position_y=20.0)
        assert nc.name == "my-bot"


class TestNodeUpdateModel:
    def test_all_optional(self):
        nu = NodeUpdate()
        dumped = nu.model_dump(exclude_unset=True)
        assert dumped == {}

    def test_partial_update(self):
        nu = NodeUpdate(name="renamed")
        dumped = nu.model_dump(exclude_unset=True)
        assert dumped == {"name": "renamed"}


class TestNodeReadModel:
    def test_from_attributes(self):
        """NodeRead should be constructable from an object with matching attrs."""
        class FakeObj:
            id = uuid.uuid4()
            name = "test"
            container_id = "c123"
            container_status = "running"
            position_x = 1.0
            position_y = 2.0
            width = 320.0
            height = 400.0
            config = {"key": "val"}
            identity = None
            agent_status = None
            agent_status_message = None
            gauge_value = None
            gauge_label = None
            gauge_unit = None
            archived = False
            area_id = None
            created_at = datetime.now(timezone.utc)
            updated_at = datetime.now(timezone.utc)

        nr = NodeRead.model_validate(FakeObj(), from_attributes=True)
        assert nr.name == "test"
        assert nr.container_id == "c123"


# ---------------------------------------------------------------------------
# _sync_identity_name helper
# ---------------------------------------------------------------------------

class TestSyncIdentityName:
    @pytest.mark.asyncio
    async def test_updates_name_in_identity(self):
        """When identity.json has a different name, it should be overwritten."""
        identity_json = json.dumps({"name": "old-name", "bio": "hello"})
        written = {}

        def fake_read(cid, fname):
            return identity_json

        def fake_write(cid, fname, content):
            written["content"] = content

        with patch("app.routes.nodes.read_workspace_file", side_effect=fake_read), \
             patch("app.routes.nodes.write_workspace_file", side_effect=fake_write):
            await _sync_identity_name("cid", "new-name")

        assert written["content"]
        parsed = json.loads(written["content"])
        assert parsed["name"] == "new-name"
        assert parsed["bio"] == "hello"

    @pytest.mark.asyncio
    async def test_noop_when_no_identity_file(self):
        """If identity.json doesn't exist, nothing should happen."""
        with patch("app.routes.nodes.read_workspace_file", return_value=None), \
             patch("app.routes.nodes.write_workspace_file") as mock_write:
            await _sync_identity_name("cid", "new-name")
            mock_write.assert_not_called()

    @pytest.mark.asyncio
    async def test_noop_when_malformed_json(self):
        with patch("app.routes.nodes.read_workspace_file", return_value="not json{{{"), \
             patch("app.routes.nodes.write_workspace_file") as mock_write:
            await _sync_identity_name("cid", "new-name")
            mock_write.assert_not_called()

    @pytest.mark.asyncio
    async def test_noop_when_not_dict(self):
        with patch("app.routes.nodes.read_workspace_file", return_value='"just a string"'), \
             patch("app.routes.nodes.write_workspace_file") as mock_write:
            await _sync_identity_name("cid", "new-name")
            mock_write.assert_not_called()


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

class FakeNode:
    """Minimal node stand-in for route handler tests."""
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.name = kwargs.get("name", "test-node")
        self.container_id = kwargs.get("container_id", "c123")
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
        self.archived = kwargs.get("archived", False)
        self.area_id = kwargs.get("area_id", None)
        self.created_at = kwargs.get("created_at", datetime.now(timezone.utc))
        self.updated_at = kwargs.get("updated_at", datetime.now(timezone.utc))


class TestCreateNode:
    @pytest.mark.asyncio
    async def test_creates_node_successfully(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        # Mock db.execute for area_id resolution (select(Area).order_by(...).limit(1))
        fake_area_result = MagicMock()
        fake_area_result.scalars.return_value.first.return_value = MagicMock(id=uuid.uuid4())
        db.execute = AsyncMock(return_value=fake_area_result)

        payload = NodeCreate(name="my-bot")

        with patch("app.routes.nodes.setup_container", new_callable=AsyncMock) as mock_setup, \
             patch("app.routes.nodes.emit_event", new_callable=AsyncMock):
            mock_setup.return_value = "container-id"
            result = await create_node(payload=payload, db=db)

        db.add.assert_called_once()
        db.commit.assert_awaited_once()
        added_node = db.add.call_args[0][0]
        assert added_node.name == "my-bot"

    @pytest.mark.asyncio
    async def test_handles_container_creation_failure(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        # Mock db.execute for area_id resolution (select(Area).order_by(...).limit(1))
        fake_area_result = MagicMock()
        fake_area_result.scalars.return_value.first.return_value = MagicMock(id=uuid.uuid4())
        db.execute = AsyncMock(return_value=fake_area_result)

        payload = NodeCreate(name="failing-bot")

        with patch("app.routes.nodes.setup_container", side_effect=RuntimeError("docker fail")), \
             patch("app.routes.nodes.emit_event", new_callable=AsyncMock):
            result = await create_node(payload=payload, db=db)

        added_node = db.add.call_args[0][0]
        assert added_node.container_status == "error"
        assert "docker fail" in added_node.config.get("error", "")


class TestGetNode:
    @pytest.mark.asyncio
    async def test_returns_node(self):
        node = FakeNode(name="found-node")
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()

        with patch("app.routes.nodes.get_container_status", return_value="running"):
            result = await get_node(node_id=node.id, db=db)

        assert result.name == "found-node"

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await get_node(node_id=uuid.uuid4(), db=db)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_refreshes_container_status(self):
        node = FakeNode(container_status="running")
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()

        with patch("app.routes.nodes.get_container_status", return_value="exited"):
            result = await get_node(node_id=node.id, db=db)

        assert node.container_status == "exited"


class TestDeleteNode:
    @pytest.mark.asyncio
    async def test_deletes_node_and_stops_container(self):
        node = FakeNode(container_id="c123")
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.routes.nodes.stop_nanobot_container") as mock_stop, \
             patch("app.routes.nodes.emit_event", new_callable=AsyncMock):
            result = await delete_node(node_id=node.id, db=db)

        mock_stop.assert_called_once_with("c123")
        db.delete.assert_awaited_once_with(node)
        assert result == {"ok": True}

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await delete_node(node_id=uuid.uuid4(), db=db)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_skips_stop_when_no_container(self):
        node = FakeNode(container_id=None)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        with patch("app.routes.nodes.stop_nanobot_container") as mock_stop, \
             patch("app.routes.nodes.emit_event", new_callable=AsyncMock):
            await delete_node(node_id=node.id, db=db)

        mock_stop.assert_not_called()


class TestUpdateNode:
    @pytest.mark.asyncio
    async def test_partial_update(self):
        node = FakeNode(name="original")
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        payload = NodeUpdate(position_x=99.0)

        with patch("app.routes.nodes.emit_event", new_callable=AsyncMock), \
             patch("app.routes.nodes.broadcast") as mock_broadcast:
            result = await update_node(node_id=node.id, payload=payload, db=db)

        assert node.position_x == 99.0
        assert node.name == "original"  # not changed

    @pytest.mark.asyncio
    async def test_rename_syncs_identity(self):
        node = FakeNode(name="old-name", container_id="c123")
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        payload = NodeUpdate(name="new-name")

        with patch("app.routes.nodes._sync_identity_name", new_callable=AsyncMock) as mock_sync, \
             patch("app.routes.nodes.emit_event", new_callable=AsyncMock), \
             patch("app.routes.nodes.broadcast") as mock_broadcast:
            mock_broadcast.publish = AsyncMock()
            result = await update_node(node_id=node.id, payload=payload, db=db)

        mock_sync.assert_awaited_once_with("c123", "new-name")

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await update_node(node_id=uuid.uuid4(), payload=NodeUpdate(), db=db)
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# Config endpoints
# ---------------------------------------------------------------------------

class TestGetNodeConfig:
    @pytest.mark.asyncio
    async def test_reads_config_from_container(self):
        node = FakeNode(container_id="c123")
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)

        with patch("app.routes.nodes.read_nanobot_config", return_value={"model": "gpt-4"}):
            result = await get_node_config(node_id=node.id, db=db)

        assert result == {"config": {"model": "gpt-4"}}

    @pytest.mark.asyncio
    async def test_raises_404_when_no_container(self):
        node = FakeNode(container_id=None)
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)

        with pytest.raises(HTTPException) as exc_info:
            await get_node_config(node_id=node.id, db=db)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_404_when_no_node(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await get_node_config(node_id=uuid.uuid4(), db=db)
        assert exc_info.value.status_code == 404


class TestUpdateNodeConfig:
    @pytest.mark.asyncio
    async def test_writes_config_and_caches(self):
        node = FakeNode(container_id="c123")
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.commit = AsyncMock()

        request = UpdateNodeConfigRequest(config={"model": "claude"})

        with patch("app.routes.nodes.write_nanobot_config") as mock_write:
            result = await update_node_config(node_id=node.id, request=request, db=db)

        mock_write.assert_called_once_with("c123", {"model": "claude"})
        assert node.config == {"model": "claude"}
        assert result == {"ok": True}
