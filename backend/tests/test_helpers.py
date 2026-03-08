"""Tests for app.routes.helpers — node_summary, sync_identity_name,
get_network_topology, _resolve_templates, setup_container.
"""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routes.helpers import (
    ALLOWED_WORKSPACE_FILES,
    DEFAULT_TEMPLATES,
    _resolve_templates,
    get_network_topology,
    node_summary,
    setup_container,
    sync_identity_name,
)


# ---------------------------------------------------------------------------
# Fake model helpers (avoid ORM overhead)
# ---------------------------------------------------------------------------

class FakeNode:
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
        self.area_id = kwargs.get("area_id", None)


class FakeEdge:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.source_id = kwargs.get("source_id", uuid.uuid4())
        self.target_id = kwargs.get("target_id", uuid.uuid4())
        self.edge_type = kwargs.get("edge_type", "connection")
        self.chat_enabled = kwargs.get("chat_enabled", False)


class FakeCanvasState:
    def __init__(self, **kwargs):
        self.default_nanobot_config = kwargs.get("default_nanobot_config", None)
        self.default_agent_templates = kwargs.get("default_agent_templates", None)


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


# ---------------------------------------------------------------------------
# node_summary
# ---------------------------------------------------------------------------

class TestNodeSummary:
    def test_basic_summary(self):
        node = FakeNode(name="bot-1", agent_status="ok", agent_status_message="running")
        result = node_summary(node)

        assert result["name"] == "bot-1"
        assert result["id"] == str(node.id)
        assert result["agent_status"] == "ok"
        assert result["agent_status_message"] == "running"
        assert "edge_type" not in result

    def test_with_edge_type(self):
        node = FakeNode(name="bot-2")
        result = node_summary(node, edge_type="monitoring")

        assert result["edge_type"] == "monitoring"

    def test_identity_included(self):
        node = FakeNode(identity={"bio": "I am a bot", "name": "bot"})
        result = node_summary(node)

        assert result["identity"] == {"bio": "I am a bot", "name": "bot"}

    def test_none_agent_status(self):
        node = FakeNode(agent_status=None, agent_status_message=None)
        result = node_summary(node)

        assert result["agent_status"] is None
        assert result["agent_status_message"] is None


# ---------------------------------------------------------------------------
# sync_identity_name
# ---------------------------------------------------------------------------

class TestSyncIdentityName:
    @pytest.mark.asyncio
    async def test_fixes_drifted_name(self):
        """When identity name != expected, rewrite identity.json."""
        identity = {"name": "old-name", "bio": "hello"}
        written_content = {}

        def fake_write(cid, fname, content):
            written_content["data"] = content

        with patch("app.routes.helpers.write_workspace_file", side_effect=fake_write):
            result = await sync_identity_name("c123", "correct-name", identity)

        assert result["name"] == "correct-name"
        assert result["bio"] == "hello"
        assert written_content["data"]
        parsed = json.loads(written_content["data"])
        assert parsed["name"] == "correct-name"

    @pytest.mark.asyncio
    async def test_noop_when_names_match(self):
        """No write should occur when the name already matches."""
        identity = {"name": "same-name", "bio": "x"}

        with patch("app.routes.helpers.write_workspace_file") as mock_write:
            result = await sync_identity_name("c123", "same-name", identity)

        mock_write.assert_not_called()
        assert result["name"] == "same-name"

    @pytest.mark.asyncio
    async def test_noop_when_no_name_key(self):
        """If identity dict has no 'name' key, don't modify."""
        identity = {"bio": "no name field"}

        with patch("app.routes.helpers.write_workspace_file") as mock_write:
            result = await sync_identity_name("c123", "expected", identity)

        mock_write.assert_not_called()

    @pytest.mark.asyncio
    async def test_noop_when_not_dict(self):
        """If identity is not a dict, return it unchanged."""
        identity = "not a dict"

        with patch("app.routes.helpers.write_workspace_file") as mock_write:
            result = await sync_identity_name("c123", "expected", identity)

        mock_write.assert_not_called()
        assert result == "not a dict"

    @pytest.mark.asyncio
    async def test_survives_write_failure(self):
        """If write fails, the corrected dict should still be returned."""
        identity = {"name": "old", "bio": "x"}

        with patch("app.routes.helpers.write_workspace_file", side_effect=RuntimeError("write failed")):
            result = await sync_identity_name("c123", "new", identity)

        assert result["name"] == "new"  # corrected in-place even though write failed


# ---------------------------------------------------------------------------
# get_network_topology
# ---------------------------------------------------------------------------

class TestGetNetworkTopology:
    @pytest.mark.asyncio
    async def test_returns_empty_dict_when_node_not_found(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        result = await get_network_topology(uuid.uuid4(), db)
        assert result == {}

    @pytest.mark.asyncio
    async def test_returns_self_when_no_edges(self):
        node = FakeNode(name="solo")
        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.execute = AsyncMock(return_value=FakeResult([]))

        result = await get_network_topology(node.id, db)

        assert result["self"]["name"] == "solo"
        assert result["parents"] == []
        assert result["children"] == []
        assert result["siblings"] == []

    @pytest.mark.asyncio
    async def test_includes_parents_and_children(self):
        parent_id = uuid.uuid4()
        child_id = uuid.uuid4()
        node_id = uuid.uuid4()

        node = FakeNode(id=node_id, name="center")
        parent = FakeNode(id=parent_id, name="parent")
        child = FakeNode(id=child_id, name="child")

        # edges_out (node -> child), edges_in (parent -> node)
        edge_out = FakeEdge(source_id=node_id, target_id=child_id)
        edge_in = FakeEdge(source_id=parent_id, target_id=node_id)

        call_count = [0]

        async def mock_execute(stmt):
            call_count[0] += 1
            if call_count[0] == 1:
                return FakeResult([edge_out])  # edges_out
            elif call_count[0] == 2:
                return FakeResult([edge_in])   # edges_in
            else:
                return FakeResult([parent, child])  # all related nodes

        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.execute = mock_execute

        result = await get_network_topology(node_id, db)

        assert result["self"]["name"] == "center"
        assert len(result["parents"]) == 1
        assert result["parents"][0]["name"] == "parent"
        assert len(result["children"]) == 1
        assert result["children"][0]["name"] == "child"

    @pytest.mark.asyncio
    async def test_includes_edge_types_when_requested(self):
        parent_id = uuid.uuid4()
        node_id = uuid.uuid4()

        node = FakeNode(id=node_id, name="center")
        parent = FakeNode(id=parent_id, name="parent")

        edge_in = FakeEdge(source_id=parent_id, target_id=node_id, edge_type="monitoring")

        call_count = [0]

        async def mock_execute(stmt):
            call_count[0] += 1
            if call_count[0] == 1:
                return FakeResult([])         # edges_out
            elif call_count[0] == 2:
                return FakeResult([edge_in])  # edges_in
            else:
                return FakeResult([parent])   # related nodes

        db = AsyncMock()
        db.get = AsyncMock(return_value=node)
        db.execute = mock_execute

        result = await get_network_topology(node_id, db, include_edge_types=True)

        assert result["parents"][0]["edge_type"] == "monitoring"


# ---------------------------------------------------------------------------
# _resolve_templates
# ---------------------------------------------------------------------------

class TestResolveTemplates:
    @pytest.mark.asyncio
    async def test_returns_defaults_when_no_canvas_state(self):
        result = await _resolve_templates(None)

        # Should only include files in ALLOWED_WORKSPACE_FILES with non-empty content
        for filename in result:
            assert filename in ALLOWED_WORKSPACE_FILES
        assert "SOUL.md" in result
        assert "AGENTS.md" in result

    @pytest.mark.asyncio
    async def test_returns_defaults_when_no_custom_templates(self):
        canvas = FakeCanvasState(default_agent_templates=None)
        result = await _resolve_templates(canvas)

        assert "SOUL.md" in result

    @pytest.mark.asyncio
    async def test_uses_custom_templates(self):
        canvas = FakeCanvasState(default_agent_templates={
            "SOUL.md": "# Custom Soul",
            "AGENTS.md": "# Custom Agents",
        })
        result = await _resolve_templates(canvas)

        assert result["SOUL.md"] == "# Custom Soul"
        assert result["AGENTS.md"] == "# Custom Agents"

    @pytest.mark.asyncio
    async def test_filters_disallowed_filenames(self):
        canvas = FakeCanvasState(default_agent_templates={
            "SOUL.md": "content",
            "evil_script.sh": "rm -rf /",
        })
        result = await _resolve_templates(canvas)

        assert "SOUL.md" in result
        assert "evil_script.sh" not in result

    @pytest.mark.asyncio
    async def test_filters_empty_content(self):
        canvas = FakeCanvasState(default_agent_templates={
            "SOUL.md": "content",
            "USER.md": "",  # empty
        })
        result = await _resolve_templates(canvas)

        assert "SOUL.md" in result
        assert "USER.md" not in result


# ---------------------------------------------------------------------------
# ALLOWED_WORKSPACE_FILES and DEFAULT_TEMPLATES
# ---------------------------------------------------------------------------

class TestAllowedWorkspaceFiles:
    def test_contains_required_files(self):
        expected = {"SOUL.md", "AGENTS.md", "USER.md", "HEARTBEAT.md", "TOOLS.md", "identity.json"}
        assert expected.issubset(ALLOWED_WORKSPACE_FILES)

    def test_default_templates_subset_of_allowed(self):
        for filename in DEFAULT_TEMPLATES:
            assert filename in ALLOWED_WORKSPACE_FILES, f"{filename} not in ALLOWED_WORKSPACE_FILES"


# ---------------------------------------------------------------------------
# setup_container
# ---------------------------------------------------------------------------

class TestSetupContainer:
    @pytest.mark.asyncio
    async def test_creates_container_and_applies_defaults(self):
        node = FakeNode(name="new-bot", config=None)
        canvas = FakeCanvasState(default_nanobot_config={"model": "gpt-4"})

        db = AsyncMock()
        db.get = AsyncMock(return_value=canvas)

        with patch("app.routes.helpers.create_nanobot_container", return_value="new-cid") as mock_create, \
             patch("app.routes.helpers.write_nanobot_config") as mock_write_config, \
             patch("app.routes.helpers.write_workspace_files_batch") as mock_write_batch:
            cid = await setup_container(node, db)

        assert cid == "new-cid"
        assert node.container_id == "new-cid"
        assert node.container_status == "running"
        mock_create.assert_called_once()
        mock_write_config.assert_called_once_with("new-cid", {"model": "gpt-4"})
        assert node.config == {"model": "gpt-4"}

    @pytest.mark.asyncio
    async def test_uses_config_override(self):
        node = FakeNode(name="override-bot")
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)  # no canvas state

        override_config = {"model": "claude", "temperature": 0.5}

        with patch("app.routes.helpers.create_nanobot_container", return_value="cid-2"), \
             patch("app.routes.helpers.write_nanobot_config") as mock_write_config, \
             patch("app.routes.helpers.write_workspace_files_batch"):
            await setup_container(node, db, config_override=override_config)

        mock_write_config.assert_called_once_with("cid-2", override_config)
        assert node.config == override_config

    @pytest.mark.asyncio
    async def test_no_config_when_no_override_and_no_canvas(self):
        node = FakeNode(name="bare-bot")
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)  # no canvas state

        with patch("app.routes.helpers.create_nanobot_container", return_value="cid-3"), \
             patch("app.routes.helpers.write_nanobot_config") as mock_write_config, \
             patch("app.routes.helpers.write_workspace_files_batch"):
            await setup_container(node, db)

        # No config override and no canvas config => write_nanobot_config not called
        mock_write_config.assert_not_called()
