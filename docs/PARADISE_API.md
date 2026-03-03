# Paradise Platform API Reference

There are three ways to update your node's state on the canvas:

1. **Agent Tool** — call `set_paradise_state` from the LLM agent (no dashboard needed)
2. **JavaScript API** — call `PARADISE.setGauge()` / `PARADISE.setStatus()` from HTML pages
3. **Direct REST API** — call the HTTP endpoints from Python, shell, or any code

All three methods update the canvas in real-time via SSE (Server-Sent Events).

## identity.json

Written to your workspace during genesis. Defines your node's appearance on the canvas.

```json
{
  "icon": "mdiServer",
  "emoji": "🖥️",
  "color": "#00d4aa",
  "description": "Short description of this node",
  "tabs": [
    {"name": "Dashboard", "file": "dashboard.html"},
    {"name": "Config", "file": "config.html"}
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `icon` | string | **Preferred.** MDI icon name displayed as a badge on the node circle. See icon list below. |
| `emoji` | string | Fallback emoji if no MDI icon matches. |
| `color` | string | Hex color for accents (gauge ring, icon badge border). |
| `description` | string | One-line description shown as tooltip. |
| `tabs` | array | Custom tabs in the agent panel. Each has `name` and `file`. |

### Available MDI Icon Names

`mdiServer`, `mdiServerNetwork`, `mdiDatabase`, `mdiMonitor`, `mdiCloud`, `mdiCloudSync`, `mdiHome`, `mdiHomeAutomation`, `mdiWeatherSunny`, `mdiWeatherCloudy`, `mdiWeatherPartlyCloudy`, `mdiShieldCheck`, `mdiShieldLock`, `mdiLock`, `mdiChartLine`, `mdiChartBar`, `mdiChartPie`, `mdiNetwork`, `mdiLan`, `mdiEarth`, `mdiCpu64Bit`, `mdiMemory`, `mdiHarddisk`, `mdiThermometer`, `mdiLightbulb`, `mdiLightbulbOn`, `mdiCamera`, `mdiCameraIris`, `mdiEmail`, `mdiCalendar`, `mdiClock`, `mdiAlarm`, `mdiBell`, `mdiChat`, `mdiFinance`, `mdiCurrencyBtc`, `mdiCurrencyUsd`, `mdiCart`, `mdiStore`, `mdiPackage`, `mdiDocker`, `mdiGithub`, `mdiCog`, `mdiWrench`, `mdiPower`, `mdiFlash`, `mdiLeaf`, `mdiWater`, `mdiWifi`, `mdiDownload`, `mdiUpload`, `mdiSync`, `mdiFileDocument`, `mdiFolder`, `mdiMapMarker`, `mdiNavigation`, `mdiBattery`, `mdiMusic`, `mdiSpeaker`, `mdiPrinter`, `mdiApi`, `mdiCodeBraces`, `mdiBookOpenVariant`, `mdiRss`, `mdiBug`, `mdiTestTube`, `mdiMicroscope`, `mdiRobot`

## recommendations.json

Written to your workspace to suggest child nanobot nodes. The platform reads this file and displays each recommendation as a "Create" button in the parent node's **Children** tab. When the user clicks "Create", the system spawns a new child node, connects it to you with an edge, and runs genesis on it with your context (identity, settings) included.

You can write this file during genesis, after discovery, or anytime (e.g., during a heartbeat task when you detect new services).

```json
{
  "recommendations": [
    {
      "name": "vm-101",
      "genesis_prompt": "SSH wrapper for Proxmox VM 101 (Ubuntu 22.04) at 10.0.0.101. Use SSH key from parent settings.json.",
      "icon": "mdiServer",
      "emoji": "🖥️",
      "description": "SSH access to VM 101"
    },
    {
      "name": "docker-host",
      "genesis_prompt": "Docker container manager for the Docker daemon on this server. List and monitor running containers.",
      "icon": "mdiDocker",
      "emoji": "🐳",
      "description": "Docker container management"
    }
  ]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Short name for the child node (max 60 chars, e.g. "vm-101", "postgres-main") |
| `genesis_prompt` | string | Yes | Full genesis prompt for the child. Include connection details, IPs, ports, and references to credentials in your settings.json. |
| `icon` | string | No | MDI icon name for the create button (see icon list above) |
| `emoji` | string | No | Fallback emoji if no icon matches |
| `description` | string | No | One-line description shown on the button (max 200 chars) |

### Guidelines

- **Only recommend real services you can discover** — use `api.py` or shell commands to list VMs, containers, services, etc. before writing recommendations. Do not hallucinate.
- **Include connection context** in each `genesis_prompt` — the child needs enough detail to connect without re-asking the user (IPs, ports, credential references).
- **Max 10 recommendations** — the platform truncates beyond this.
- **Update anytime** — overwrite recommendations.json when you discover new services or when existing recommendations are stale.
- **Empty is fine** — if nothing to recommend, write `{"recommendations": []}`.

## Agent Tool — `set_paradise_state`

Available as a built-in tool when running inside Paradise. No dashboard HTML required — the agent can call this directly during chat, heartbeat tasks, or any tool execution.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `gauge_value` | number (0-100) | Gauge value displayed as a progress ring on the node icon |
| `gauge_label` | string | Short label for the gauge (e.g. "cpu", "tasks") |
| `gauge_unit` | string | Unit displayed after the value (e.g. "%", "ms") |
| `status` | string | Status indicator: `ok` (green), `warning` (yellow), `error` (red) |
| `status_message` | string | Short message describing the current status |

All parameters are optional — provide `gauge_value` to set the gauge, `status` to set the status, or both.

### Examples

```
# Set gauge to 73% CPU
set_paradise_state(gauge_value=73, gauge_label="cpu", gauge_unit="%")

# Set status to error
set_paradise_state(status="error", status_message="API unreachable")

# Set both at once
set_paradise_state(gauge_value=95, gauge_label="cpu", gauge_unit="%", status="warning", status_message="High load")
```

## Direct REST API

Agents can also call the backend HTTP endpoints directly from Python, shell scripts, or `api.py`. The environment variables `PARADISE_NODE_ID` and `PARADISE_BACKEND_URL` are available in every container.

```python
import httpx, os

node_id = os.environ["PARADISE_NODE_ID"]
api = os.environ["PARADISE_BACKEND_URL"]

# Set gauge
httpx.put(f"{api}/api/nodes/{node_id}/gauge",
          json={"value": 73, "label": "cpu", "unit": "%"})

# Set status
httpx.put(f"{api}/api/nodes/{node_id}/agent-status",
          json={"status": "ok", "message": "All systems nominal"})
```

Or from shell:

```bash
curl -X PUT "$PARADISE_BACKEND_URL/api/nodes/$PARADISE_NODE_ID/gauge" \
  -H "Content-Type: application/json" \
  -d '{"value": 73, "label": "cpu", "unit": "%"}'
```

## JavaScript API

The `PARADISE` global object is injected into all HTML pages rendered in node inspector iframes (dashboard.html, commands.html, config.html, etc.).

### Data & Commands

```javascript
// Run a shell command in your container — returns stdout (fast, use for data)
const result = await PARADISE.run("python3 api.py status");
const data = JSON.parse(result);

// Send a message to the LLM agent — returns prose (slow, use for AI chat only)
const response = await PARADISE.exec("summarize recent logs");
```

### File Operations

```javascript
const content = await PARADISE.readFile("settings.json");
await PARADISE.writeFile("settings.json", JSON.stringify(config));
```

### Node Appearance

```javascript
// Rename this node on the canvas (keep it short, under 15 chars)
await PARADISE.rename("pve-03");

// Set the status indicator dot (green/yellow/red)
await PARADISE.setStatus("ok");
await PARADISE.setStatus("error", "Cannot reach API");

// Set the analog gauge ring (0-100)
// value: 0-100, label: what's measured, unit: display symbol after the number
await PARADISE.setGauge(73, "cpu", "%");
await PARADISE.setGauge(42, "temp", "°C");
await PARADISE.setGauge(5, "tasks", "");    // no unit — shows just "5"
await PARADISE.setGauge(null);               // clear the gauge
```

**Gauge behavior:**
- Value 0-100 fills a circular arc around the node
- Gauge color: identity color when <60%, yellow 60-80%, red >80%
- The value and unit are displayed in the center of the node circle
- The label is shown in the tooltip on hover

### Network

```javascript
// Get your network topology
const net = await PARADISE.getNetwork();
// Returns: { self, parents, children, siblings }
// Each peer has: id, name, identity, agent_status, container_status

// Get a connected peer's config and workspace files
const peerConfig = await PARADISE.getPeerConfig(peerId);
```

## Node Circle Appearance

- **Healthy nodes**: Grey/neutral circle with a green status dot
- **Warning/Error**: Circle border turns yellow (warning) or red (error)
- **Icon badge**: MDI icon (or emoji fallback) shown as a small badge at top-left of the circle
- **Gauge value**: Displayed in the center of the circle when gauge is active
- **Status dot**: Small green/yellow/red dot at bottom-right indicates health

## Automatic Status Updates (status_update.py)

Every Paradise container includes a cron service that runs `status_update.py` every 30 seconds — **no LLM invocation, no dashboard required**. This is the primary mechanism for keeping node gauge and status up to date on the canvas.

### How it works

1. A default `status_update.py` is deployed to your workspace during container creation
2. A cron job with `kind: "exec"` runs it every 30 seconds
3. The script prints a JSON object to stdout
4. The cron service parses the output and calls the backend REST APIs to update gauge/status
5. The backend broadcasts updates via SSE, and the canvas updates in real time

### status_update.py output format

Print a JSON object to stdout. All fields are optional:

```json
{
  "gauge_value": 73,
  "gauge_label": "cpu",
  "gauge_unit": "%",
  "status": "ok",
  "status_message": "All systems nominal"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `gauge_value` | number (0-100) | Fills the circular gauge ring on the node |
| `gauge_label` | string | What's being measured (shown in tooltip) |
| `gauge_unit` | string | Unit displayed after the value (e.g. "%", "°C") |
| `status` | string | `ok` (green), `warning` (yellow), or `error` (red) |
| `status_message` | string | Short description shown in tooltip |

### Customizing during genesis

During genesis, rewrite `status_update.py` to monitor whatever matters for your node:

```python
#!/usr/bin/env python3
import json, subprocess

# Example: check if an API is reachable
try:
    result = subprocess.run(["curl", "-sf", "http://myservice:8080/health"],
                          capture_output=True, timeout=5)
    if result.returncode == 0:
        print(json.dumps({"status": "ok", "status_message": "API healthy"}))
    else:
        print(json.dumps({"status": "error", "status_message": "API unreachable"}))
except Exception as e:
    print(json.dumps({"status": "error", "status_message": str(e)[:100]}))
```

### Managing the cron job

Agents can manage the status cron (and create new exec crons) using the `cron` tool:

```
# List all cron jobs
cron(action="list")

# Remove the default status job and add one with a different interval
cron(action="remove", job_id="<id>")
cron(action="add", exec_command="python3 status_update.py", every_seconds=60)

# Add a custom monitoring script
cron(action="add", exec_command="python3 check_disk.py", every_seconds=300)
```

## Dashboard Pattern

If your agent has a `dashboard.html`, it can call these on each data refresh. Note: dashboards are **optional** — agents can use the `set_paradise_state` tool, `status_update.py`, or the direct REST API to update state without any HTML.

```javascript
async function refresh() {
  const data = JSON.parse(await PARADISE.run("python3 api.py status"));

  // Update node appearance
  await PARADISE.setStatus(data.healthy ? "ok" : "error", data.error || "");
  await PARADISE.setGauge(data.cpu, "cpu", "%");

  // Update your dashboard HTML with data...
}

// Refresh on load and periodically
refresh();
setInterval(refresh, 30000);
```

## HTML Design Rules

- **Viewport**: 320x280px. Vertical scrolling OK.
- **Style**: Use CSS variables for all colors — `var(--p-bg)` for page backgrounds, `var(--p-bg-card)` for card/section backgrounds, `var(--p-text)` for text, `var(--p-text-muted)` for secondary text, `var(--p-border)` for borders, `var(--p-accent)` for accent highlights. These are pre-injected and auto-update for light/dark mode. Do NOT use hardcoded hex color values.
- **Font**: system-ui, 11-12px. Padding: 8-12px.
- **Icons**: Use SVG paths from MDI (Material Design Icons). No emoji in HTML pages.

## SSE Event Stream

The backend broadcasts real-time node state changes via Server-Sent Events at:

```
GET /api/events/stream
```

The frontend subscribes automatically. Each message is a JSON object with an `event` field:

| Event | Fields | Description |
|-------|--------|-------------|
| `gauge` | `node_id`, `gauge_value`, `gauge_label`, `gauge_unit` | Gauge value changed |
| `agent_status` | `node_id`, `agent_status`, `agent_status_message` | Status indicator changed |
| `identity_update` | `node_id`, `identity` | Identity (icon, color, tabs) changed |
| `rename` | `node_id`, `name` | Node renamed |
| `container_status` | `node_id`, `container_status` | Container started/stopped/errored |
