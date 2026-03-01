"""Paradise backend — canvas state API and nanobot orchestration."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.db import Node, async_session, engine, create_tables
from app.docker_ops import get_container_status
from app.routes import canvas, nodes, edges, chat, events

log = logging.getLogger("paradise")


async def reconcile_containers():
    """Sync DB node status with actual Docker container state on startup."""
    async with async_session() as db:
        result = await db.execute(select(Node).where(Node.container_id.isnot(None)))
        for node in result.scalars().all():
            actual = get_container_status(node.container_id)
            if actual != node.container_status:
                log.info(
                    "reconcile: node %s (%s) status %s -> %s",
                    node.name, str(node.id)[:8], node.container_status, actual,
                )
                node.container_status = actual
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    await reconcile_containers()
    yield
    await engine.dispose()


app = FastAPI(title="Paradise", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(canvas.router, prefix="/api")
app.include_router(nodes.router, prefix="/api")
app.include_router(edges.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(events.router, prefix="/api")


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
