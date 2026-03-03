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
from pathlib import Path

import websockets

PORT = int(os.environ.get("PARADISE_WS_PORT", "18790"))
HOST = os.environ.get("PARADISE_WS_HOST", "0.0.0.0")

agent_loop = None
cron_service = None
_ready = asyncio.Event()
_init_error = None


def _make_provider(config):
    """Create LLM provider — mirrors nanobot.cli.commands._make_provider."""
    from nanobot.providers.litellm_provider import LiteLLMProvider
    from nanobot.providers.custom_provider import CustomProvider

    model = config.agents.defaults.model
    provider_name = config.get_provider_name(model)
    p = config.get_provider(model)

    if provider_name == "custom":
        return CustomProvider(
            api_key=p.api_key if p else "no-key",
            api_base=config.get_api_base(model) or "http://localhost:8000/v1",
            default_model=model,
        )

    if not p or not p.api_key:
        raise RuntimeError(
            f"No API key configured for provider '{provider_name}'. "
            "Set it in the Conf tab under providers."
        )

    return LiteLLMProvider(
        api_key=p.api_key,
        api_base=config.get_api_base(model),
        default_model=model,
        extra_headers=p.extra_headers if p else None,
        provider_name=provider_name,
    )


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
            print(f"[paradise] Created {item.name}", flush=True)

    memory_dir = workspace / "memory"
    memory_dir.mkdir(exist_ok=True)
    memory_file = memory_dir / "MEMORY.md"
    if not memory_file.exists():
        tpl = templates_dir / "memory" / "MEMORY.md"
        memory_file.write_text(tpl.read_text(encoding="utf-8"), encoding="utf-8")

    (workspace / "skills").mkdir(exist_ok=True)


def _init_cron_service(workspace: Path, node_id: str, backend_url: str):
    """Create the CronService with Paradise exec support."""
    global cron_service

    from nanobot.cron.service import CronService
    from nanobot.cron.types import CronSchedule

    cron_store_path = Path.home() / ".nanobot" / "cron" / "jobs.json"
    cron_service = CronService(
        cron_store_path,
        workspace=workspace,
        node_id=node_id,
        backend_url=backend_url,
    )

    # on_job callback for agent_turn kind (requires LLM)
    async def on_cron_job(job):
        if agent_loop and not _init_error:
            return await agent_loop.process_direct(
                job.payload.message,
                session_key=f"cron:{job.id}",
                channel="paradise",
                chat_id="paradise",
            )
    cron_service.on_job = on_cron_job

    # Seed default status-update cron if no jobs exist yet
    if not cron_service.list_jobs(include_disabled=True):
        cron_service.add_job(
            name="status-update",
            schedule=CronSchedule(kind="every", every_ms=30_000),
            exec_command="python3 status_update.py",
        )
        print("[paradise] Seeded default status-update cron job (every 30s)", flush=True)

    return cron_service


async def init_agent():
    """Initialize (or reinitialize) the nanobot agent from current config."""
    global agent_loop, cron_service, _init_error
    _ready.clear()
    _init_error = None

    try:
        _ensure_workspace_templates()

        from nanobot.config.loader import load_config
        from nanobot.bus.queue import MessageBus
        from nanobot.agent.loop import AgentLoop
        from nanobot.session.manager import SessionManager

        config = load_config()
        bus = MessageBus()
        provider = _make_provider(config)
        session_manager = SessionManager(config.workspace_path)

        node_id = os.environ.get("PARADISE_NODE_ID", "")
        backend_url = os.environ.get("PARADISE_BACKEND_URL", "http://backend:8000")

        # Init cron service (only once — survives agent reloads)
        if cron_service is None and node_id:
            _init_cron_service(config.workspace_path, node_id, backend_url)

        agent_loop = AgentLoop(
            bus=bus,
            provider=provider,
            workspace=config.workspace_path,
            model=config.agents.defaults.model,
            temperature=config.agents.defaults.temperature,
            max_tokens=config.agents.defaults.max_tokens,
            max_iterations=config.agents.defaults.max_tool_iterations,
            memory_window=config.agents.defaults.memory_window,
            restrict_to_workspace=config.tools.restrict_to_workspace,
            session_manager=session_manager,
            cron_service=cron_service,
        )

        # Register Paradise tools if running inside Paradise
        if node_id:
            from nanobot.agent.tools.network import NetworkTool
            from nanobot.agent.tools.paradise import ParadiseTool
            agent_loop.tools.register(NetworkTool(node_id=node_id))
            agent_loop.tools.register(ParadiseTool(node_id=node_id))

        _ready.set()
        print(f"[paradise] Agent initialized, model={config.agents.defaults.model}", flush=True)
    except Exception as exc:
        _init_error = str(exc)
        _ready.set()  # unblock clients so they get the error
        print(f"[paradise] Agent init failed: {exc}", flush=True)


async def handle_client(websocket):
    """Handle a single WebSocket client connection."""
    await _ready.wait()

    peer = websocket.remote_address
    print(f"[paradise] Client connected: {peer}", flush=True)

    # Send initial status
    if _init_error:
        await websocket.send(json.dumps({
            "type": "status", "ready": False,
            "message": f"Agent not ready: {_init_error}. Configure a model in the Conf tab and send {{\"type\": \"reload\"}}.",
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
                if _init_error:
                    await websocket.send(json.dumps({"type": "status", "ready": False, "message": f"Reload failed: {_init_error}"}))
                else:
                    await websocket.send(json.dumps({"type": "status", "ready": True, "message": "Agent reloaded"}))
                continue

            # Chat
            content = msg.get("content", "").strip()
            if not content:
                await websocket.send(json.dumps({"type": "error", "message": "Empty message"}))
                continue

            if agent_loop is None or _init_error:
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
                response = await agent_loop.process_direct(
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
        print(f"[paradise] Client disconnected: {peer}", flush=True)


async def _start_cron_when_ready():
    """Wait for agent init, then start the cron service."""
    await _ready.wait()
    if cron_service:
        await cron_service.start()
        print(f"[paradise] Cron service started ({cron_service.status()['jobs']} jobs)", flush=True)


async def main():
    print(f"[paradise] Starting WebSocket server on {HOST}:{PORT}", flush=True)

    # Try to init agent (will fail gracefully if no config yet)
    asyncio.create_task(init_agent())

    # Start cron after agent is ready
    asyncio.create_task(_start_cron_when_ready())

    stop = asyncio.get_event_loop().create_future()
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_event_loop().add_signal_handler(sig, stop.set_result, None)

    async with websockets.serve(handle_client, HOST, PORT):
        print(f"[paradise] Listening on ws://{HOST}:{PORT}", flush=True)
        await stop

    # Cleanup
    if cron_service:
        cron_service.stop()


if __name__ == "__main__":
    asyncio.run(main())
