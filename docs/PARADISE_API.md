# Paradise Platform API Reference

Reference for the PARADISE JavaScript API available in all HTML pages (dashboard.html, commands.html, config.html, etc.).

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

## JavaScript API

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

## Dashboard Pattern

Your `dashboard.html` should call these on each data refresh:

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
- **Style**: Dark grayscale. bg `#0a0a0a`, text `#e0e0e0`, muted `#888`, borders `#222`. Use identity color for accent highlights only.
- **Font**: system-ui, 11-12px. Padding: 8-12px.
- **Icons**: Use SVG paths from MDI (Material Design Icons). No emoji in HTML pages.
