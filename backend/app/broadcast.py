"""In-process pub/sub broadcaster for Server-Sent Events (SSE)."""

import asyncio
import json
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


class Broadcaster:
    """Fan-out broadcaster: publish messages to all connected SSE subscribers."""

    def __init__(self) -> None:
        self._queues: list[asyncio.Queue[str]] = []

    async def publish(self, event_type: str, data: dict) -> None:
        msg = json.dumps({"event": event_type, **data})
        for q in list(self._queues):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                logger.debug("Dropping SSE message for slow client (queue full), event_type=%s", event_type)

    async def subscribe(self) -> AsyncGenerator[str, None]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=256)
        self._queues.append(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._queues.remove(q)


broadcast = Broadcaster()
