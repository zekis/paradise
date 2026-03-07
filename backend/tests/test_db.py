"""Tests for app.db — model definitions, column presence, and utility functions."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.db import Area, Base, CanvasState, ChatMessage, Edge, EventLog, Node


# ---------------------------------------------------------------------------
# Model table-name and column introspection
# ---------------------------------------------------------------------------

class TestNodeModel:
    """Verify the Node ORM model has the expected schema."""

    def test_tablename(self):
        assert Node.__tablename__ == "nodes"

    def test_primary_key_is_uuid(self):
        col = Node.__table__.c["id"]
        assert col.primary_key

    def test_required_columns_exist(self):
        col_names = {c.name for c in Node.__table__.columns}
        expected = {
            "id", "name", "container_id", "container_status",
            "position_x", "position_y", "width", "height",
            "config", "identity",
            "agent_status", "agent_status_message",
            "gauge_value", "gauge_label", "gauge_unit",
            "area_id",
            "created_at", "updated_at",
        }
        assert expected.issubset(col_names), f"Missing columns: {expected - col_names}"

    def test_name_default(self):
        col = Node.__table__.c["name"]
        assert col.default is not None
        assert col.default.arg == "new-nanobot"

    def test_position_defaults(self):
        assert Node.__table__.c["position_x"].default.arg == 0.0
        assert Node.__table__.c["position_y"].default.arg == 0.0

    def test_dimension_defaults(self):
        assert Node.__table__.c["width"].default.arg == 320.0
        assert Node.__table__.c["height"].default.arg == 400.0

    def test_container_status_default(self):
        assert Node.__table__.c["container_status"].default.arg == "pending"

    def test_area_id_foreign_key(self):
        fks = list(Node.__table__.c["area_id"].foreign_keys)
        assert len(fks) == 1
        assert "areas.id" in str(fks[0])

    def test_area_relationship(self):
        rel_names = {r.key for r in Node.__mapper__.relationships}
        assert "area" in rel_names

    def test_relationships_declared(self):
        rel_names = {r.key for r in Node.__mapper__.relationships}
        assert "edges_out" in rel_names
        assert "edges_in" in rel_names


class TestEdgeModel:
    """Verify the Edge ORM model."""

    def test_tablename(self):
        assert Edge.__tablename__ == "edges"

    def test_required_columns(self):
        col_names = {c.name for c in Edge.__table__.columns}
        expected = {
            "id", "source_id", "target_id", "edge_type",
            "source_handle", "target_handle", "created_at",
        }
        assert expected.issubset(col_names)

    def test_foreign_keys(self):
        src_fk = list(Edge.__table__.c["source_id"].foreign_keys)
        tgt_fk = list(Edge.__table__.c["target_id"].foreign_keys)
        assert len(src_fk) == 1
        assert len(tgt_fk) == 1
        assert "nodes.id" in str(src_fk[0])
        assert "nodes.id" in str(tgt_fk[0])

    def test_edge_type_default(self):
        assert Edge.__table__.c["edge_type"].default.arg == "connection"

    def test_relationships(self):
        rel_names = {r.key for r in Edge.__mapper__.relationships}
        assert "source" in rel_names
        assert "target" in rel_names


class TestCanvasStateModel:
    """Verify the CanvasState model."""

    def test_tablename(self):
        assert CanvasState.__tablename__ == "canvas_state"

    def test_columns(self):
        col_names = {c.name for c in CanvasState.__table__.columns}
        expected = {
            "id", "viewport_x", "viewport_y", "zoom",
            "default_nanobot_config", "default_agent_templates",
        }
        assert expected.issubset(col_names)

    def test_zoom_default(self):
        assert CanvasState.__table__.c["zoom"].default.arg == 1.0


class TestAreaModel:
    """Verify the Area ORM model."""

    def test_tablename(self):
        assert Area.__tablename__ == "areas"

    def test_primary_key_is_uuid(self):
        col = Area.__table__.c["id"]
        assert col.primary_key

    def test_required_columns_exist(self):
        col_names = {c.name for c in Area.__table__.columns}
        expected = {"id", "name", "sort_order", "created_at"}
        assert expected.issubset(col_names), f"Missing columns: {expected - col_names}"

    def test_name_default(self):
        col = Area.__table__.c["name"]
        assert col.default is not None
        assert col.default.arg == "Main"

    def test_sort_order_default(self):
        col = Area.__table__.c["sort_order"]
        assert col.default is not None
        assert col.default.arg == 0.0

    def test_relationships_declared(self):
        rel_names = {r.key for r in Area.__mapper__.relationships}
        assert "nodes" in rel_names


class TestChatMessageModel:
    """Verify the ChatMessage model."""

    def test_tablename(self):
        assert ChatMessage.__tablename__ == "chat_messages"

    def test_columns(self):
        col_names = {c.name for c in ChatMessage.__table__.columns}
        expected = {
            "id", "node_id", "role", "content",
            "message_type", "display_content", "created_at",
        }
        assert expected.issubset(col_names)

    def test_node_id_foreign_key(self):
        fks = list(ChatMessage.__table__.c["node_id"].foreign_keys)
        assert len(fks) == 1
        assert "nodes.id" in str(fks[0])

    def test_message_type_default(self):
        assert ChatMessage.__table__.c["message_type"].default.arg == "chat"


class TestEventLogModel:
    """Verify the EventLog model."""

    def test_tablename(self):
        assert EventLog.__tablename__ == "event_logs"

    def test_columns(self):
        col_names = {c.name for c in EventLog.__table__.columns}
        expected = {
            "id", "event_type", "node_id", "node_name",
            "summary", "details", "created_at",
        }
        assert expected.issubset(col_names)

    def test_event_type_indexed(self):
        col = EventLog.__table__.c["event_type"]
        assert col.index is True

    def test_node_id_nullable(self):
        col = EventLog.__table__.c["node_id"]
        assert col.nullable is True


class TestBaseDeclarative:
    """Meta tests on the declarative Base."""

    def test_all_models_share_base(self):
        for model in (Area, Node, Edge, CanvasState, ChatMessage, EventLog):
            assert issubclass(model, Base)

    def test_metadata_table_count(self):
        table_names = set(Base.metadata.tables.keys())
        expected = {"areas", "nodes", "edges", "canvas_state", "chat_messages", "event_logs"}
        assert expected.issubset(table_names)


# ---------------------------------------------------------------------------
# emit_event utility
# ---------------------------------------------------------------------------

class TestEmitEvent:
    """Test the fire-and-forget emit_event helper."""

    @pytest.mark.asyncio
    async def test_emit_event_persists_entry(self):
        """emit_event should create an EventLog row via async_session."""
        fake_session = MagicMock()
        fake_session.add = MagicMock()
        fake_session.commit = AsyncMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.db.async_session", return_value=fake_session):
            from app.db import emit_event
            await emit_event(
                "test_event",
                node_id=uuid.uuid4(),
                node_name="n1",
                summary="something happened",
                details={"key": "value"},
            )
        fake_session.add.assert_called_once()
        fake_session.commit.assert_awaited_once()
        added_obj = fake_session.add.call_args[0][0]
        assert added_obj.event_type == "test_event"
        assert added_obj.summary == "something happened"

    @pytest.mark.asyncio
    async def test_emit_event_swallows_exceptions(self):
        """emit_event should not raise even when the DB is unavailable."""
        fake_session = MagicMock()
        fake_session.__aenter__ = AsyncMock(side_effect=RuntimeError("db down"))
        fake_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.db.async_session", return_value=fake_session):
            from app.db import emit_event
            # Should NOT raise
            await emit_event("crash_event")


# ---------------------------------------------------------------------------
# get_db generator
# ---------------------------------------------------------------------------

class TestGetDb:
    """Test the get_db async generator dependency."""

    @pytest.mark.asyncio
    async def test_get_db_yields_session(self):
        fake_session = MagicMock()
        fake_session.__aenter__ = AsyncMock(return_value=fake_session)
        fake_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.db.async_session", return_value=fake_session):
            from app.db import get_db
            gen = get_db()
            session = await gen.__anext__()
            assert session is fake_session
