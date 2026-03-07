"""Paradise backend — canvas state API and nanobot orchestration."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from sqlalchemy import select

from app.broadcast import broadcast
from app.db import Node, async_session, engine, create_tables, emit_event
from app.docker_ops import get_container_status, read_workspace_file
from app.routes import areas, canvas, nodes, edges, chat, events, workspace, node_status, node_network, agent_api
from app.routes.helpers import recreate_container, sync_identity_name


class _InterceptHandler(logging.Handler):
    """Route stdlib logging records through loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = logging.currentframe(), 2
        while frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back  # type: ignore[assignment]
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


logging.basicConfig(handlers=[_InterceptHandler()], level=0, force=True)

CONTAINER_CHECK_INTERVAL = 30  # seconds
IDENTITY_CHECK_INTERVAL = 60   # seconds


async def reconcile_containers():
    """Sync DB node status with actual Docker container state on startup.

    Containers that have disappeared are automatically recreated with
    their cached config and default templates.
    """
    async with async_session() as db:
        result = await db.execute(
            select(Node).where(Node.container_id.isnot(None), Node.archived == False)
        )
        all_nodes = result.scalars().all()

        # Pass 1: sync status from Docker (parallel)
        statuses = await asyncio.gather(*[
            asyncio.to_thread(get_container_status, n.container_id)
            for n in all_nodes
        ])
        for node, actual in zip(all_nodes, statuses):
            if actual != node.container_status:
                logger.info(
                    "reconcile: node {} ({}) status {} -> {}",
                    node.name, str(node.id)[:8], node.container_status, actual,
                )
                node.container_status = actual
        await db.commit()

        # Pass 2: recreate missing containers
        for node in all_nodes:
            if node.container_status == "not_found":
                try:
                    logger.info(
                        "reconcile: recreating container for node {} ({})",
                        node.name, str(node.id)[:8],
                    )
                    await recreate_container(node, db)
                    await db.commit()
                    await emit_event(
                        "container_recreated",
                        node_id=node.id,
                        node_name=node.name,
                        summary=f'Container recreated for "{node.name}" during startup',
                    )
                except Exception as exc:
                    logger.error(
                        "reconcile: failed to recreate container for {}: {}",
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


async def _check_container_statuses(all_nodes, db):
    """Check container statuses and broadcast any changes."""
    statuses = await asyncio.gather(*[
        asyncio.to_thread(get_container_status, n.container_id)
        for n in all_nodes
    ])
    for node, actual in zip(all_nodes, statuses):
        if actual != node.container_status:
            logger.info(
                "maintenance: node {} ({}) status {} -> {}",
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
            await broadcast.publish("container_status", {
                "node_id": str(node.id),
                "container_status": actual,
                "area_id": str(node.area_id) if node.area_id else None,
            })

    await db.commit()


async def _sync_node_gauge(node, gauge_src):
    """Parse gauge fields from identity data and broadcast changes."""
    if "gauge" in gauge_src and isinstance(gauge_src["gauge"], dict):
        g = gauge_src["gauge"]
        gauge_src = {
            "gauge_value": g.get("value", g.get("gauge_value")),
            "gauge_label": g.get("label", g.get("gauge_label", "")),
            "gauge_unit": g.get("unit", g.get("gauge_unit", "")),
        }
    if "gauge_value" in gauge_src:
        old_gv = node.gauge_value
        raw_gv = gauge_src.get("gauge_value")
        if raw_gv is not None:
            try:
                gv = float(raw_gv)
                if 0 <= gv <= 100:
                    node.gauge_value = gv
                    node.gauge_label = str(gauge_src.get("gauge_label", ""))[:100] or None
                    node.gauge_unit = str(gauge_src.get("gauge_unit", ""))[:20] or None
            except (TypeError, ValueError):
                logger.debug(
                    "maintenance: invalid gauge_value {!r} for node {}",
                    raw_gv, node.name,
                )
        else:
            node.gauge_value = None
            node.gauge_label = None
            node.gauge_unit = None
        if node.gauge_value != old_gv:
            await broadcast.publish("gauge", {
                "node_id": str(node.id),
                "gauge_value": node.gauge_value,
                "gauge_label": node.gauge_label,
                "gauge_unit": node.gauge_unit,
                "area_id": str(node.area_id) if node.area_id else None,
            })


async def _refresh_identities(running_nodes, db):
    """Read identity.json from each running container and sync to DB."""
    identity_contents = await asyncio.gather(*[
        asyncio.to_thread(
            read_workspace_file, n.container_id, "identity.json"
        )
        for n in running_nodes
    ], return_exceptions=True)
    # Apply updates sequentially (DB session safety)
    for node, content in zip(running_nodes, identity_contents):
        if isinstance(content, Exception):
            logger.debug(
                "maintenance: identity read failed for {}: {}",
                node.name, content,
            )
            continue
        if not content:
            continue
        try:
            identity = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            logger.debug(
                "maintenance: malformed identity.json for node {}",
                node.name,
            )
            continue

        # Sync DB node name back into identity if drifted
        identity = await sync_identity_name(node.container_id, node.name, identity)

        if identity != node.identity:
            node.identity = identity
            await emit_event(
                "identity_update",
                node_id=node.id,
                node_name=node.name,
                summary=f'Identity refreshed for "{node.name}"',
            )
            await broadcast.publish("identity_update", {
                "node_id": str(node.id),
                "identity": identity,
                "area_id": str(node.area_id) if node.area_id else None,
            })

        # Sync gauge value from identity.json (flat or nested)
        await _sync_node_gauge(node, identity if isinstance(identity, dict) else {})

    await db.commit()


async def _check_recommendations(running_nodes):
    """Read recommendations.json from running containers and broadcast if present."""
    recs_contents = await asyncio.gather(*[
        asyncio.to_thread(
            read_workspace_file, n.container_id, "recommendations.json"
        )
        for n in running_nodes
    ], return_exceptions=True)
    for node, content in zip(running_nodes, recs_contents):
        if isinstance(content, Exception) or not content:
            continue
        try:
            data = json.loads(content)
            recs = data if isinstance(data, list) else data.get("recommendations", [])
            if recs:
                await broadcast.publish("recommendations_ready", {
                    "node_id": str(node.id),
                    "area_id": str(node.area_id) if node.area_id else None,
                })
        except (json.JSONDecodeError, TypeError):
            logger.debug(
                "maintenance: malformed recommendations.json for node {}",
                node.name,
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
                    select(Node).where(Node.container_id.isnot(None), Node.archived == False)
                )
                all_nodes = result.scalars().all()

                # --- Container status check (every 30s) ---
                await _check_container_statuses(all_nodes, db)

                # --- Identity refresh (every 60s) ---
                if ticks % (IDENTITY_CHECK_INTERVAL // CONTAINER_CHECK_INTERVAL) == 0:
                    running_nodes = [n for n in all_nodes if n.container_status == "running"]
                    await _refresh_identities(running_nodes, db)
                    await _check_recommendations(running_nodes)

        except asyncio.CancelledError:
            logger.info("maintenance loop cancelled")
            raise
        except Exception as exc:
            logger.error("maintenance loop error: {}", exc)
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
        logger.debug("maintenance task finished after cancellation")
    await engine.dispose()


app = FastAPI(title="Paradise", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(areas.router, prefix="/api")
app.include_router(canvas.router, prefix="/api")
app.include_router(nodes.router, prefix="/api")
app.include_router(workspace.router, prefix="/api")
app.include_router(node_status.router, prefix="/api")
app.include_router(node_network.router, prefix="/api")
app.include_router(edges.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(agent_api.router, prefix="/api")


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
