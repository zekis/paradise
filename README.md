![Desloppify Score](scorecard.png)

# Paradise

**Spatial canvas for AI agent fleet management.**

Spawn, connect, monitor, and chat with multiple AI agent containers — each one a specialized "nanobot" — on an infinite visual canvas. Give any agent a Genesis prompt ("Proxmox server manager", "weather dashboard") and it writes its own identity, dashboards, and API scripts.

## Architecture

```
Browser (Next.js 15 / React Flow)
       │
       │ REST + WebSocket
       ▼
 FastAPI Backend (Python 3.12)
  ├── Canvas API    /api/canvas
  ├── Nodes API     /api/nodes
  ├── Edges API     /api/edges
  ├── Agent API     /api/agent            ← external programmatic access
  ├── SSE Stream    /api/events/stream    ← real-time state push
  ├── Chat Relay    /api/nodes/{id}/chat  ← WebSocket bridge
  └── Peer Msgs     /api/nodes/{id}/peer-message
       │                │
       │ SQLAlchemy     │ Docker SDK (unix socket)
       ▼                ▼
 PostgreSQL 16     Docker Engine
  nodes              ├── nanobot-{id}  ← WS :18790
  edges              ├── nanobot-{id}  ← WS :18790
  canvas_state       └── ...
  chat_messages
```

Chat uses a three-layer WebSocket relay: browser → FastAPI → nanobot container. Messages are persisted to the database even when the frontend is disconnected.

## Features

- **Infinite canvas** — React Flow with snap-to-grid, minimap, and pan/zoom; viewport persisted to PostgreSQL
- **Nanobot lifecycle** — create, delete, restart, rebuild, and clone containers from the canvas
- **Genesis** — describe what an agent should be; it writes its own `identity.json`, HTML dashboards, and `api.py` scripts
- **Node inspector** — side drawer with tabs: Chat, Object (dashboard/config/commands/children), Agent files, Config, Logs, Info/Stats
- **PARADISE Bridge API** — JavaScript API injected into agent-rendered iframes: `exec()`, `run()`, `readFile()`, `writeFile()`, `rename()`, `setStatus()`
- **Agent state tool** — agents can call `set_paradise_state` to update their gauge/status directly, no dashboard HTML required
- **Real-time SSE** — backend broadcasts state changes (gauge, status, identity, container) to all connected frontends via Server-Sent Events
- **Agent status signaling** — agents call `setStatus(ok|warning|error)` to update the status dot on the canvas
- **Global settings** — default nanobot config and agent file templates applied to every new container
- **Dark theme** — CSS custom properties, system-ui font stack
- **External Agent API** — programmatic REST access for external agents: query the network, chat with nanobots, create nodes; optional API-key auth
- **Archive / Resume** — archive idle nodes (stops container, fades on canvas) and resume them later with workspace data preserved
- **Interbot communication** — peer-to-peer messaging between nanobots through chat-enabled edges; BFS peer discovery

## Quick Start

### Prerequisites

- Docker and Docker Compose
- [nanobot](https://github.com/search?q=nanobot) source at `/root/nanobot` on the host (required by the `nanobot-image` build stage in `docker-compose.yml`)

### Run

```bash
docker compose up --build
```

| Service  | URL                   |
|----------|-----------------------|
| Frontend | http://localhost:3000  |
| Backend  | http://localhost:8000  |
| Postgres | localhost:5432         |

On first boot the backend creates all database tables and reconciles any existing container state.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://paradise:paradise@db:5432/paradise` | Async SQLAlchemy connection string |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker daemon socket path |
| `PARADISE_NETWORK` | `paradise_paradise` | Docker network nanobots attach to |
| `NANOBOT_IMAGE` | `paradise-nanobot` | Image tag for spawning nanobot containers |
| `NEXT_PUBLIC_API_URL` | *(auto-detected from browser)* | Override backend API base URL |
| `PARADISE_WS_PORT` | `18790` | WebSocket port inside nanobot containers |
| `PARADISE_AGENT_API_KEY` | *(empty — no enforcement)* | API key for the external Agent API. Set to a secret to require `X-API-Key` header |

## Project Structure

```
paradise/
├── docker-compose.yml          # Orchestrates all services
├── frontend/                   # Next.js 15 + React 19 + TypeScript
│   └── src/
│       ├── app/                # App Router pages
│       ├── components/         # Canvas, NodeDrawer, ChatTab, HtmlTab, ...
│       ├── hooks/              # useCanvasSync, useChatSocket, useAsyncForm
│       ├── store/              # Zustand canvas store
│       └── types.ts            # Shared TypeScript types
├── backend/                    # FastAPI + SQLAlchemy 2.0 (async)
│   └── app/
│       ├── main.py             # App entrypoint + startup reconciliation
│       ├── db.py               # Models: Node, Edge, CanvasState, ChatMessage
│       ├── docker_ops.py       # Container lifecycle (create, stop, clone, file I/O)
│       └── routes/             # canvas, nodes, edges, chat, agent_api, ...
└── nanobot/                    # Nanobot container image
    ├── Dockerfile
    └── server.py               # WebSocket server on :18790
```

## PARADISE Bridge API

HTML files rendered inside node inspector iframes have access to a `PARADISE` global object:

```js
// Run a shell command in the container (no LLM, fast)
const output = await PARADISE.run("python3 api.py status");

// Send a prompt to the node's AI agent
const answer = await PARADISE.exec("Summarize recent logs");

// Read / write workspace files
const soul = await PARADISE.readFile("SOUL.md");
await PARADISE.writeFile("dashboard.html", updatedHtml);

// Update the node's name on the canvas
await PARADISE.rename("My Proxmox Agent");

// Set the status dot color on the canvas node
await PARADISE.setStatus("ok", "All systems nominal");

// Set the analog gauge ring on the canvas node (0-100)
await PARADISE.setGauge(73, "cpu", "%");
```

Agents can also update gauge and status **without dashboard HTML** using the built-in `set_paradise_state` tool or by calling the REST API directly. See `docs/PARADISE_API.md` for details.

## Workspace Files

Each nanobot container has a workspace at `/root/.nanobot/workspace/`:

| File | Purpose |
|---|---|
| `SOUL.md` | Agent personality, values, and communication style |
| `AGENTS.md` | Operational instructions and tool definitions |
| `USER.md` | User profile — name, timezone, preferences |
| `HEARTBEAT.md` | Periodic tasks checked every 30 minutes |
| `TOOLS.md` | Custom tool definitions |
| `identity.json` | Agent identity (emoji, color, tabs) — written by Genesis |
| `dashboard.html` | Main Object tab dashboard |
| `config.html` | Object config sub-tab |
| `commands.html` | Object commands sub-tab |
| `children.html` | Object children sub-tab |
| `api.py` | Python API script called by dashboards via `PARADISE.run()` |

## External Agent API

Programmatic REST interface at `/api/agent/` for scripts, bots, and orchestration layers that need to interact with the nanobot network without the browser UI.

### Authentication

Set `PARADISE_AGENT_API_KEY` to a secret. When set, every request must include:

```
X-API-Key: <your-key>
```

When the variable is empty (default), the API is open.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent/network` | Full graph snapshot (nodes + edges) |
| GET | `/api/agent/nodes` | List active nodes |
| POST | `/api/agent/nodes` | Create node (optional `genesis_prompt`, `parent_id`) |
| GET | `/api/agent/nodes/{id}` | Single node detail |
| GET | `/api/agent/nodes/{id}/network` | Node's parents, children, siblings |
| GET | `/api/agent/nodes/{id}/peers` | Chat-reachable peers (BFS) |
| GET | `/api/agent/nodes/{id}/messages` | Chat history (oldest first, `?limit=50`) |
| GET | `/api/agent/edges` | List all edges |
| POST | `/api/agent/nodes/{id}/chat` | Send message, get synchronous response |

### Quick example

```bash
# List all nodes
curl -H "X-API-Key: $KEY" http://localhost:8000/api/agent/nodes

# Chat with a node
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  http://localhost:8000/api/agent/nodes/<node-id>/chat \
  -d '{"message": "What is your status?"}'
```

## Archive / Resume

Idle nodes can be archived to free resources. Right-click a node on the canvas:

- **Archive** — stops and removes the container; node fades to a muted state on the canvas
- **Resume** — recreates the container from the saved image; node returns to active state

Workspace data (volumes) is preserved across archive/resume cycles. Archived nodes are excluded from the Agent API's node listings. Other lifecycle actions (restart, rebuild, clone) are blocked until the node is resumed.

## Interbot Communication

Nanobots can send messages to each other through **chat-enabled edges**.

1. **Enable chat on an edge** — right-click an edge on the canvas and toggle "Chat enabled", or `PATCH /api/edges/{id}` with `{"chat_enabled": true}`
2. **Send a peer message** — `POST /api/nodes/{id}/peer-message` with `{"target_node_id": "<uuid>", "content": "..."}`
3. **Peer discovery** — reachable peers are found via BFS over all chat-enabled edges (treated as undirected). Query with `GET /api/agent/nodes/{id}/peers`

Messages are logged in both sender and receiver chat histories with types `peer_out`, `peer_in`, and `peer_response`.
