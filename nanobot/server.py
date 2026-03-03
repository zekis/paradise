"""Thin WebSocket server wrapping nanobot's agent for Paradise integration.

Protocol (JSON over WebSocket):

  Client -> Server:
    {"type": "chat", "content": "hello"}
    {"type": "reload"}                      # re-read config and reinit agent

  Server -> Client (streaming token):
    {"type": "progress", "content": "partial text so far..."}

  Server -> Client (final response):
    {"type": "response", "content": "full response"}

  Server -> Client (error):
    {"type": "error", "message": "description"}

  Server -> Client (status):
    {"type": "status", "ready": true/false, "message": "..."}
"""

import asyncio
import json
import os
import signal
from dataclasses import dataclass, field
from pathlib import Path

import websockets
from loguru import logger

PORT = int(os.environ.get("PARADISE_WS_PORT", "18790"))
HOST = os.environ.get("PARADISE_WS_HOST", "0.0.0.0")


@dataclass
class ServerState:
    """Mutable server state encapsulated in a single object."""

    agent_loop: object | None = None
    init_error: str | None = None
    ready: asyncio.Event = field(default_factory=asyncio.Event)
    cron_service: object | None = None


_state = ServerState()


def _ensure_workspace_templates():
    """Create default workspace .md files from bundled nanobot templates (like 'nanobot init')."""
    from pathlib import Path
    from importlib.resources import files as pkg_files

    workspace = Path.home() / ".nanobot" / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)

    templates_dir = pkg_files("nanobot") / "templates"
    for item in templates_dir.iterdir():
        if not item.name.endswith(".md"):
            continue
        dest = workspace / item.name
        if not dest.exists():
            dest.write_text(item.read_text(encoding="utf-8"), encoding="utf-8")
            logger.info("Created {}", item.name)

    memory_dir = workspace / "memory"
    memory_dir.mkdir(exist_ok=True)
    memory_file = memory_dir / "MEMORY.md"
    if not memory_file.exists():
        tpl = templates_dir / "memory" / "MEMORY.md"
        memory_file.write_text(tpl.read_text(encoding="utf-8"), encoding="utf-8")

    (workspace / "skills").mkdir(exist_ok=True)


def _init_cron_service():
    """Create and configure the CronService for Paradise (once only)."""
    if _state.cron_service is not None:
        return

    node_id = os.environ.get("PARADISE_NODE_ID", "")
    backend_url = os.environ.get("PARADISE_BACKEND_URL", "http://backend:8000")
    workspace = Path.home() / ".nanobot" / "workspace"

    from nanobot.cron.service import CronService
    from nanobot.cron.types import CronSchedule

    cron_store_path = Path.home() / ".nanobot" / "cron" / "jobs.json"
    _state.cron_service = CronService(
        cron_store_path,
        workspace=workspace,
        node_id=node_id,
        backend_url=backend_url,
    )

    async def on_cron_job(job):
        if _state.agent_loop and not _state.init_error:
            return await _state.agent_loop.process_direct(
                job.payload.message,
                session_key=f"cron:{job.id}",
                channel="paradise",
                chat_id="paradise",
            )

    _state.cron_service.on_job = on_cron_job

    # Seed default status-update cron if no jobs exist
    if not _state.cron_service.list_jobs(include_disabled=True):
        _state.cron_service.add_job(
            name="status-update",
            schedule=CronSchedule(kind="every", every_ms=30_000),
            exec_command="python3 status_update.py",
        )
    logger.info("CronService initialized")


async def _start_cron_when_ready():
    """Wait for agent init, then start the cron service."""
    await _state.ready.wait()
    if _state.cron_service:
        await _state.cron_service.start()
        logger.info("CronService started")


async def init_agent():
    """Initialize (or reinitialize) the nanobot agent from current config."""
    _state.ready.clear()
    _state.init_error = None

    try:
        _ensure_workspace_templates()

        from nanobot.config.loader import load_config
        from nanobot.bus.queue import MessageBus
        from nanobot.agent.loop import AgentLoop
        from nanobot.session.manager import SessionManager

        from nanobot.providers.registry import make_provider

        config = load_config()
        bus = MessageBus()
        provider = make_provider(config)
        session_manager = SessionManager(config.workspace_path)

        _state.agent_loop = AgentLoop.from_config(
            config,
            bus=bus,
            provider=provider,
            session_manager=session_manager,
        )

        # Register Paradise tools if running inside Paradise
        node_id = os.environ.get("PARADISE_NODE_ID", "")
        if node_id:
            from nanobot.agent.tools.network import NetworkTool
            from nanobot.agent.tools.paradise import ParadiseTool
            _state.agent_loop.tools.register(NetworkTool(node_id=node_id))
            _state.agent_loop.tools.register(ParadiseTool(node_id=node_id))

        # Register cron tool
        _init_cron_service()
        if _state.cron_service:
            from nanobot.agent.tools.cron import CronTool
            _state.agent_loop.tools.register(CronTool(_state.cron_service))

        _state.ready.set()
        logger.info("Agent initialized, model={}", config.agents.defaults.model)
    except Exception as exc:
        _state.init_error = str(exc)
        _state.ready.set()  # unblock clients so they get the error
        logger.error("Agent init failed: {}", exc)


async def handle_client(websocket):
    """Handle a single WebSocket client connection."""
    await _state.ready.wait()

    peer = websocket.remote_address
    logger.info("Client connected: {}", peer)

    # Send initial status
    if _state.init_error:
        await websocket.send(json.dumps({
            "type": "status", "ready": False,
            "message": f"Agent not ready: {_state.init_error}. Configure a model in the Conf tab and send {{\"type\": \"reload\"}}.",
        }))
    else:
        await websocket.send(json.dumps({"type": "status", "ready": True, "message": "Agent ready"}))

    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            msg_type = msg.get("type", "chat")

            # Ping
            if msg_type == "ping":
                await websocket.send(json.dumps({"type": "pong"}))
                continue

            # Reload config and reinitialize agent
            if msg_type == "reload":
                await websocket.send(json.dumps({"type": "status", "ready": False, "message": "Reloading..."}))
                await init_agent()
                if _state.init_error:
                    await websocket.send(json.dumps({"type": "status", "ready": False, "message": f"Reload failed: {_state.init_error}"}))
                else:
                    await websocket.send(json.dumps({"type": "status", "ready": True, "message": "Agent reloaded"}))
                continue

            # Chat
            content = msg.get("content", "").strip()
            if not content:
                await websocket.send(json.dumps({"type": "error", "message": "Empty message"}))
                continue

            if _state.agent_loop is None or _state.init_error:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "No model configured. Use the Conf tab to set providers and model, then save.",
                }))
                continue

            session_key = msg.get("session_key", "paradise:default")
            network = msg.get("network")

            async def on_progress(text: str, **kw) -> None:
                try:
                    if kw.get("tool_hint"):
                        await websocket.send(json.dumps({"type": "tool_call", "content": text}))
                    else:
                        await websocket.send(json.dumps({"type": "progress", "content": text}))
                except Exception:
                    pass

            try:
                response = await _state.agent_loop.process_direct(
                    content,
                    session_key=session_key,
                    channel="paradise",
                    chat_id="paradise",
                    on_progress=on_progress,
                    network=network,
                )
                await websocket.send(json.dumps({"type": "response", "content": response}))
            except Exception as exc:
                await websocket.send(json.dumps({"type": "error", "message": str(exc)}))

    except websockets.ConnectionClosed:
        pass
    finally:
        logger.info("Client disconnected: {}", peer)


async def main():
    logger.info("Starting WebSocket server on {}:{}", HOST, PORT)

    # Try to init agent (will fail gracefully if no config yet)
    asyncio.create_task(init_agent())
    asyncio.create_task(_start_cron_when_ready())

    stop = asyncio.get_event_loop().create_future()
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_event_loop().add_signal_handler(sig, stop.set_result, None)

    async with websockets.serve(handle_client, HOST, PORT):
        logger.info("Listening on ws://{}:{}", HOST, PORT)
        await stop


if __name__ == "__main__":
    asyncio.run(main())
