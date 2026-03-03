"""Tests for app.broadcast — Broadcaster pub/sub system."""

import asyncio
import json

import pytest

from app.broadcast import Broadcaster, broadcast


# ---------------------------------------------------------------------------
# Broadcaster unit tests
# ---------------------------------------------------------------------------

class TestBroadcaster:
    def test_initial_state(self):
        b = Broadcaster()
        assert b._queues == []

    @pytest.mark.asyncio
    async def test_publish_to_no_subscribers(self):
        """Publishing with zero subscribers should succeed silently."""
        b = Broadcaster()
        await b.publish("test_event", {"key": "value"})
        # No error raised

    @pytest.mark.asyncio
    async def test_publish_delivers_to_subscriber(self):
        """A single subscriber should receive published messages."""
        b = Broadcaster()
        received = []

        async def collect():
            async for msg in b.subscribe():
                received.append(msg)
                break  # stop after first message

        task = asyncio.create_task(collect())
        # Give the subscriber time to register
        await asyncio.sleep(0.01)

        await b.publish("test_event", {"foo": "bar"})
        await asyncio.sleep(0.01)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        assert len(received) == 1
        parsed = json.loads(received[0])
        assert parsed["event"] == "test_event"
        assert parsed["foo"] == "bar"

    @pytest.mark.asyncio
    async def test_publish_to_multiple_subscribers(self):
        """Multiple subscribers should each receive the same message."""
        b = Broadcaster()
        results_1 = []
        results_2 = []

        async def sub1():
            async for msg in b.subscribe():
                results_1.append(msg)
                break

        async def sub2():
            async for msg in b.subscribe():
                results_2.append(msg)
                break

        t1 = asyncio.create_task(sub1())
        t2 = asyncio.create_task(sub2())
        await asyncio.sleep(0.01)

        await b.publish("multi", {"count": 2})
        await asyncio.sleep(0.01)

        t1.cancel()
        t2.cancel()
        for t in (t1, t2):
            try:
                await t
            except asyncio.CancelledError:
                pass

        assert len(results_1) == 1
        assert len(results_2) == 1
        assert json.loads(results_1[0])["event"] == "multi"
        assert json.loads(results_2[0])["event"] == "multi"

    @pytest.mark.asyncio
    async def test_subscriber_cleanup_on_cancel(self):
        """When a subscriber task is cancelled, its queue should be removed."""
        b = Broadcaster()

        async def subscriber():
            async for _ in b.subscribe():
                pass

        task = asyncio.create_task(subscriber())
        await asyncio.sleep(0.01)
        assert len(b._queues) == 1

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        assert len(b._queues) == 0

    @pytest.mark.asyncio
    async def test_full_queue_drops_message(self):
        """When a subscriber queue is full, messages should be dropped (not block)."""
        b = Broadcaster()

        # Create a subscriber with a tiny queue
        q = asyncio.Queue(maxsize=1)
        b._queues.append(q)

        # Fill the queue
        await b.publish("e1", {"n": 1})
        # This one should be dropped, not block
        await b.publish("e2", {"n": 2})

        assert q.qsize() == 1  # only first message fits
        msg = q.get_nowait()
        parsed = json.loads(msg)
        assert parsed["n"] == 1

        # Clean up
        b._queues.remove(q)

    @pytest.mark.asyncio
    async def test_message_format(self):
        """Published messages should be JSON with 'event' key merged with data."""
        b = Broadcaster()
        q = asyncio.Queue(maxsize=10)
        b._queues.append(q)

        await b.publish("gauge", {"node_id": "abc", "gauge_value": 42.5})

        msg = q.get_nowait()
        parsed = json.loads(msg)
        assert parsed["event"] == "gauge"
        assert parsed["node_id"] == "abc"
        assert parsed["gauge_value"] == 42.5

        b._queues.remove(q)


# ---------------------------------------------------------------------------
# Module-level broadcast singleton
# ---------------------------------------------------------------------------

class TestBroadcastSingleton:
    def test_is_broadcaster_instance(self):
        assert isinstance(broadcast, Broadcaster)

    @pytest.mark.asyncio
    async def test_singleton_can_publish(self):
        """The module-level broadcast singleton should work."""
        q = asyncio.Queue(maxsize=10)
        broadcast._queues.append(q)

        await broadcast.publish("singleton_test", {"ok": True})

        msg = q.get_nowait()
        parsed = json.loads(msg)
        assert parsed["event"] == "singleton_test"
        assert parsed["ok"] is True

        broadcast._queues.remove(q)
