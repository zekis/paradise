"""Paradise backend — canvas state API and nanobot orchestration."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.db import Node, async_session, engine, create_tables, emit_event
from app.docker_ops import get_container_status, read_workspace_file, write_workspace_file
from app.routes import canvas, nodes, edges, chat, events

log = logging.getLogger("paradise")

CONTAINER_CHECK_INTERVAL = 30  # seconds
IDENTITY_CHECK_INTERVAL = 60   # seconds


async def reconcile_containers():
    """Sync DB node status with actual Docker container state on startup.

    Containers that have disappeared are automatically recreated with
    their cached config and default templates.
    """
    from app.routes.nodes import _recreate_container

    async with async_session() as db:
        result = await db.execute(select(Node).where(Node.container_id.isnot(None)))
        all_nodes = result.scalars().all()

        # Pass 1: sync status from Docker
        for node in all_nodes:
            actual = await asyncio.to_thread(get_container_status, node.container_id)
            if actual != node.container_status:
                log.info(
                    "reconcile: node %s (%s) status %s -> %s",
                    node.name, str(node.id)[:8], node.container_status, actual,
                )
                node.container_status = actual
        await db.commit()

        # Pass 2: recreate missing containers
        for node in all_nodes:
            if node.container_status == "not_found":
                try:
                    log.info(
                        "reconcile: recreating container for node %s (%s)",
                        node.name, str(node.id)[:8],
                    )
                    await _recreate_container(node, db)
                    await db.commit()
                    await emit_event(
                        "container_recreated",
                        node_id=node.id,
                        node_name=node.name,
                        summary=f'Container recreated for "{node.name}" during startup',
                    )
                except Exception as exc:
                    log.error(
                        "reconcile: failed to recreate container for %s: %s",
                        node.name, exc,
                    )
                    node.container_status = "error"
                    await db.commit()
                    await emit_event(
                        "container_recreate_failed",
                        node_id=node.id,
                        node_name=node.name,
                        summary=f'Failed to recreate container for "{node.name}": {exc}',
                    )


async def _maintenance_loop():
    """Periodically check container status and refresh identity for all nodes."""
    ticks = 0  # counts 30-second intervals

    while True:
        try:
            await asyncio.sleep(CONTAINER_CHECK_INTERVAL)
            ticks += 1

            async with async_session() as db:
                result = await db.execute(
                    select(Node).where(Node.container_id.isnot(None))
                )
                all_nodes = result.scalars().all()

                # --- Container status check (every 30s) ---
                for node in all_nodes:
                    actual = await asyncio.to_thread(
                        get_container_status, node.container_id
                    )
                    if actual != node.container_status:
                        log.info(
                            "maintenance: node %s (%s) status %s -> %s",
                            node.name, str(node.id)[:8],
                            node.container_status, actual,
                        )
                        old_status = node.container_status
                        node.container_status = actual
                        await emit_event(
                            "container_status_change",
                            node_id=node.id,
                            node_name=node.name,
                            summary=f'{node.name}: {old_status} -> {actual}',
                            details={"old_status": old_status, "new_status": actual},
                        )

                await db.commit()

                # --- Identity refresh (every 60s) ---
                if ticks % (IDENTITY_CHECK_INTERVAL // CONTAINER_CHECK_INTERVAL) == 0:
                    for node in all_nodes:
                        if node.container_status != "running":
                            continue
                        try:
                            content = await asyncio.to_thread(
                                read_workspace_file,
                                node.container_id,
                                "identity.json",
                            )
                            if not content:
                                continue

                            identity = json.loads(content)

                            # Sync DB node name back into identity if drifted
                            if (
                                isinstance(identity, dict)
                                and "name" in identity
                                and identity["name"] != node.name
                            ):
                                identity["name"] = node.name
                                try:
                                    await asyncio.to_thread(
                                        write_workspace_file,
                                        node.container_id,
                                        "identity.json",
                                        json.dumps(identity, indent=2),
                                    )
                                except Exception:
                                    pass

                            if identity != node.identity:
                                node.identity = identity
                                await emit_event(
                                    "identity_update",
                                    node_id=node.id,
                                    node_name=node.name,
                                    summary=f'Identity refreshed for "{node.name}"',
                                )
                        except (json.JSONDecodeError, TypeError):
                            pass
                        except Exception as exc:
                            log.debug(
                                "maintenance: identity read failed for %s: %s",
                                node.name, exc,
                            )

                    await db.commit()

        except asyncio.CancelledError:
            log.info("maintenance loop cancelled")
            raise
        except Exception as exc:
            log.error("maintenance loop error: %s", exc)
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    await reconcile_containers()
    maintenance_task = asyncio.create_task(_maintenance_loop())
    yield
    maintenance_task.cancel()
    try:
        await maintenance_task
    except asyncio.CancelledError:
        pass
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
