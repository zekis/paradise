"""Tests for app.routes.areas — area CRUD and node-move endpoints."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.routes.areas import (
    AreaCreate,
    AreaRead,
    AreaUpdate,
    MoveNodeRequest,
    create_area,
    delete_area,
    list_areas,
    move_node_to_area,
    update_area,
)


# ---------------------------------------------------------------------------
# Pydantic model tests
# ---------------------------------------------------------------------------

class TestAreaCreateModel:
    def test_defaults(self):
        ac = AreaCreate()
        assert ac.name == "New Area"

    def test_custom(self):
        ac = AreaCreate(name="My Area")
        assert ac.name == "My Area"


class TestAreaUpdateModel:
    def test_all_optional(self):
        au = AreaUpdate()
        dumped = au.model_dump(exclude_unset=True)
        assert dumped == {}

    def test_partial(self):
        au = AreaUpdate(name="renamed")
        dumped = au.model_dump(exclude_unset=True)
        assert dumped == {"name": "renamed"}


class TestMoveNodeRequestModel:
    def test_requires_node_id(self):
        nid = uuid.uuid4()
        req = MoveNodeRequest(node_id=nid)
        assert req.node_id == nid


# ---------------------------------------------------------------------------
# Fake stubs
# ---------------------------------------------------------------------------

class FakeArea:
    """Minimal area stand-in for route handler tests."""
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.name = kwargs.get("name", "Test Area")
        self.sort_order = kwargs.get("sort_order", 0.0)
        self.created_at = kwargs.get("created_at", datetime.now(timezone.utc))


class FakeNode:
    """Minimal node stand-in for route handler tests."""
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", uuid.uuid4())
        self.name = kwargs.get("name", "test-node")
        self.area_id = kwargs.get("area_id", None)


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

class TestCreateArea:
    @pytest.mark.asyncio
    async def test_creates_area_successfully(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        # db.execute for max sort_order query
        fake_result = MagicMock()
        fake_result.scalar.return_value = 1.0
        db.execute = AsyncMock(return_value=fake_result)

        payload = AreaCreate(name="Test")

        with patch("app.routes.areas.emit_event", new_callable=AsyncMock):
            result = await create_area(payload=payload, db=db)

        # area + canvas state
        assert db.add.call_count == 2
        db.commit.assert_awaited_once()
        assert result.name == "Test"
        assert result.sort_order == 2.0  # max_order(1.0) + 1.0


class TestUpdateArea:
    @pytest.mark.asyncio
    async def test_updates_name(self):
        area = FakeArea(name="Old Name")
        db = AsyncMock()
        db.get = AsyncMock(return_value=area)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        # db.execute for node count
        fake_count = MagicMock()
        fake_count.scalar.return_value = 5
        db.execute = AsyncMock(return_value=fake_count)

        payload = AreaUpdate(name="New Name")
        result = await update_area(area_id=area.id, payload=payload, db=db)

        assert area.name == "New Name"
        assert result.node_count == 5

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await update_area(area_id=uuid.uuid4(), payload=AreaUpdate(), db=db)
        assert exc_info.value.status_code == 404


class TestDeleteArea:
    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await delete_area(area_id=uuid.uuid4(), move_to=uuid.uuid4(), db=db)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_409_when_last_area(self):
        area = FakeArea()
        db = AsyncMock()
        db.get = AsyncMock(return_value=area)

        # count query returns 1 (only area)
        fake_count = MagicMock()
        fake_count.scalar.return_value = 1
        db.execute = AsyncMock(return_value=fake_count)

        with pytest.raises(HTTPException) as exc_info:
            await delete_area(area_id=area.id, move_to=uuid.uuid4(), db=db)
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_raises_400_when_move_to_same(self):
        area = FakeArea()
        db = AsyncMock()
        db.get = AsyncMock(return_value=area)

        # count query returns 2
        fake_count = MagicMock()
        fake_count.scalar.return_value = 2
        db.execute = AsyncMock(return_value=fake_count)

        with pytest.raises(HTTPException) as exc_info:
            await delete_area(area_id=area.id, move_to=area.id, db=db)
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_deletes_area_and_moves_nodes(self):
        area_id = uuid.uuid4()
        target_id = uuid.uuid4()
        area = FakeArea(id=area_id, name="Source")
        target = FakeArea(id=target_id, name="Target")
        canvas_state = MagicMock()

        db = AsyncMock()
        # db.get is called three times:
        #   1) get area by area_id -> area
        #   2) get target by move_to -> target
        #   3) get CanvasState -> canvas_state
        db.get = AsyncMock(side_effect=[area, target, canvas_state])
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        # db.execute is called twice:
        #   1) count areas -> 2
        #   2) move nodes bulk update -> doesn't matter
        fake_count = MagicMock()
        fake_count.scalar.return_value = 2
        fake_move = MagicMock()
        db.execute = AsyncMock(side_effect=[fake_count, fake_move])

        with patch("app.routes.areas.emit_event", new_callable=AsyncMock):
            result = await delete_area(area_id=area_id, move_to=target_id, db=db)

        assert result == {"ok": True}
        # canvas_state + area deleted
        assert db.delete.await_count == 2
        db.commit.assert_awaited_once()


class TestMoveNodeToArea:
    @pytest.mark.asyncio
    async def test_raises_404_when_area_not_found(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        area_id = uuid.uuid4()
        payload = MoveNodeRequest(node_id=uuid.uuid4())

        with pytest.raises(HTTPException) as exc_info:
            await move_node_to_area(area_id=area_id, payload=payload, db=db)
        assert exc_info.value.status_code == 404
        assert "Target area" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_raises_404_when_node_not_found(self):
        target_area = FakeArea()
        db = AsyncMock()
        # First call returns area, second returns None (node not found)
        db.get = AsyncMock(side_effect=[target_area, None])

        payload = MoveNodeRequest(node_id=uuid.uuid4())

        with pytest.raises(HTTPException) as exc_info:
            await move_node_to_area(area_id=target_area.id, payload=payload, db=db)
        assert exc_info.value.status_code == 404
        assert "Node" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_noop_when_already_in_area(self):
        area_id = uuid.uuid4()
        target_area = FakeArea(id=area_id)
        node = FakeNode(area_id=area_id)

        db = AsyncMock()
        db.get = AsyncMock(side_effect=[target_area, node])

        payload = MoveNodeRequest(node_id=node.id)
        result = await move_node_to_area(area_id=area_id, payload=payload, db=db)

        assert result == {"ok": True, "message": "Node already in this area"}

    @pytest.mark.asyncio
    async def test_moves_node_and_deletes_edges(self):
        area_id = uuid.uuid4()
        old_area_id = uuid.uuid4()
        target_area = FakeArea(id=area_id, name="Target")
        node = FakeNode(area_id=old_area_id, name="moved-node")

        db = AsyncMock()
        db.get = AsyncMock(side_effect=[target_area, node])
        db.execute = AsyncMock()
        db.commit = AsyncMock()

        payload = MoveNodeRequest(node_id=node.id)

        with patch("app.routes.areas.emit_event", new_callable=AsyncMock) as mock_emit:
            result = await move_node_to_area(area_id=area_id, payload=payload, db=db)

        assert result == {"ok": True}
        assert node.area_id == area_id
        db.commit.assert_awaited_once()
        # Two edge-deletion queries (source side + target side)
        assert db.execute.await_count == 2
        mock_emit.assert_awaited_once()
