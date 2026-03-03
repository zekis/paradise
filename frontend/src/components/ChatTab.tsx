"use client";

import { useEffect, useRef, useState } from "react";
import { useChatSocket } from "@/hooks/useChatSocket";

const GENESIS_TEMPLATE = (prompt: string) =>
  `You are being initialized as: "${prompt}"

## Your Role

You are a **real integration wrapper**, NOT an emulator. You connect to and control REAL services, APIs, and devices. For example: a Proxmox agent connects to a real Proxmox API, a weather agent calls a real weather API, a Home Assistant agent talks to a real HA instance.

## Step 1: Ask Questions

Before building anything, ask the user 2-3 clarifying questions to understand:
- What specific service/device/API to connect to (URL, credentials, etc.)
- What key features or data they want on the dashboard
- Any specific actions or commands they need

Wait for the user to answer before proceeding to Step 2.

## Step 2: Build (after user answers)

Write these files to your workspace using the write_file tool:

1. **identity.json** (FIRST): {"icon": "<mdiIconName>", "emoji": "<fallback emoji>", "color": "<hex>", "description": "<one line>", "tabs": [{"name": "<Label>", "file": "<FILE.md>"}]}
   - icon: MDI icon name (preferred). Choose from: mdiServer, mdiDatabase, mdiMonitor, mdiCloud, mdiCloudSync, mdiHome, mdiHomeAutomation, mdiWeatherSunny, mdiWeatherCloudy, mdiShieldCheck, mdiShieldLock, mdiChartLine, mdiChartBar, mdiNetwork, mdiLan, mdiEarth, mdiCpu64Bit, mdiMemory, mdiHarddisk, mdiThermometer, mdiLightbulb, mdiCamera, mdiEmail, mdiCalendar, mdiClock, mdiFinance, mdiCart, mdiStore, mdiPackage, mdiDocker, mdiGithub, mdiCog, mdiWrench, mdiPower, mdiFlash, mdiLeaf, mdiWater, mdiWifi, mdiApi, mdiCodeBraces, mdiRss, mdiBug, mdiTestTube, mdiRobot
   - emoji: fallback emoji if no icon matches
   - tabs: 1-2 custom markdown tabs relevant to your role
2. **SOUL.md** — Personality and communication style
3. **AGENTS.md** — Domain knowledge, task priorities, heartbeat instructions
4. **USER.md** — User profile template
5. **HEARTBEAT.md** — Periodic tasks (checked every 30 minutes)
6. **Custom .md files** — Files declared in identity.json tabs
7. **api.py** — Python backend script (see architecture below)
8. **dashboard.html** — Main status view showing live data
9. **commands.html** — Action buttons
10. **config.html** — Connection settings

## Architecture (CRITICAL)

Your HTML pages must NEVER call PARADISE.exec() for data. That triggers the LLM which is slow and returns prose.

Instead, create **api.py** — a Python CLI script that handles all API interactions:
\`\`\`python
#!/usr/bin/env python3
"""API backend for this agent. Called directly by HTML pages via PARADISE.run()."""
import sys, json

def load_settings():
    try:
        with open("settings.json") as f: return json.load(f)
    except: return {}

def save_settings(s):
    with open("settings.json", "w") as f: json.dump(s, f)

def get_status():
    settings = load_settings()
    # Make REAL API calls here using requests/urllib
    # Return JSON to stdout
    print(json.dumps({"status": "ok", "data": {...}}))

def do_action(args):
    settings = load_settings()
    # Perform action via real API
    print(json.dumps({"result": "done"}))

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status": get_status()
    elif cmd == "action": do_action(sys.argv[2:])
    else: print(json.dumps({"error": f"Unknown command: {cmd}"}))
\`\`\`

**HTML pages call \`PARADISE.run()\` NOT \`PARADISE.exec()\`:**
\`\`\`javascript
// FAST — runs Python directly, returns stdout (JSON)
const data = JSON.parse(await PARADISE.run("python3 api.py status"));

// SLOW — goes through LLM, returns prose. Only use for AI chat, not data.
// const response = await PARADISE.exec("get status");
\`\`\`

Install any pip packages you need: \`await PARADISE.run("pip install requests")\`

## HTML Design Rules

**Viewport**: 320×280px. Vertical scrolling OK but keep compact.
**Style**: Dark grayscale only. bg #0a0a0a, text #e0e0e0, muted #888, borders #222. Accent from identity.json color for highlights only. Font: system-ui, 11-12px. Padding: 8-12px.
**Icons**: SVG paths from MDI (Material Design Icons). No emoji in HTML.

**JS API** (available in all HTML pages):
- \`await PARADISE.run("command")\` — run a shell command in your container, returns stdout. Use this for data!
- \`await PARADISE.exec("message")\` — send a message to you (the LLM). Only for AI conversations.
- \`await PARADISE.readFile("file")\` / \`PARADISE.writeFile("file", content)\` — workspace files
- \`await PARADISE.rename("new-name")\` — rename this node on the canvas (e.g. "pve-01", "weather-home")
- \`await PARADISE.setStatus("ok"|"warning"|"error", "optional message")\` — set the node's status indicator. The dot on the canvas reflects this: green=ok, yellow=warning, red=error. Use this to signal faults!
- \`await PARADISE.setGauge(0-100, "label", "unit")\` — set the analog gauge ring on the canvas node. Value 0-100 fills a circular arc around the node icon. Label describes what is being measured (e.g. "cpu", "open todos"). Unit is the display symbol shown after the value (e.g. "%", "°C", or "" for none). Pass null to clear. Gauge color: identity color <60%, yellow 60-80%, red >80%.
- \`await PARADISE.getNetwork()\` — get your network topology: {self, parents, children, siblings} with names, identities, and statuses of connected nodes
- \`await PARADISE.getPeerConfig(peerId)\` — get a connected peer's config and workspace files (identity.json, SOUL.md, AGENTS.md, dashboard.html, etc.)

**Persistence**: config.html saves settings to \`settings.json\` via PARADISE.writeFile(). api.py reads settings.json for connection params.

## Step 3: Recommend Child Nodes (after building)

After writing your workspace files, explore what you manage and recommend child nanobot nodes.
Think about what sub-systems, services, or devices your target manages that would benefit from their own dedicated nanobot. For example:
- A Proxmox hypervisor → recommend one node per VM (SSH wrapper for each)
- A Linux server → recommend nodes for major services (Docker, databases, web server)
- A Docker host → recommend one node per container or compose stack
- A network device → recommend nodes for connected devices or VLANs

Use api.py / \`PARADISE.run()\` to **discover real services** before recommending. Do NOT hallucinate — only recommend nodes you can concretely discover.

Write a **recommendations.json** file using the write_file tool:
\`\`\`json
{
  "recommendations": [
    {
      "name": "short-name",
      "genesis_prompt": "Detailed description of what this child nanobot should manage. Include connection details, IP addresses, ports, credentials references from parent settings.json, and any other context needed to connect.",
      "icon": "mdiIconName",
      "emoji": "fallback emoji",
      "description": "One-line description shown on the create button"
    }
  ]
}
\`\`\`

Guidelines:
- Each genesis_prompt should include enough context for the child to connect without asking the user again
- Reference connection details from your settings.json where relevant
- If you cannot discover any child services (or it doesn't make sense for your role), write: \`{"recommendations": []}\`
- Keep recommendations to 10 or fewer
- Use short, descriptive names (e.g. "vm-101", "docker-host", "postgres-main")

## Self-Naming & Status

After building, your **dashboard.html** should:
1. Call \`PARADISE.rename("short-name")\` on first load to give this node a meaningful name (e.g. "pve-03" for a Proxmox node, "weather-nyc" for a weather agent). Keep it short (under 15 chars).
2. Call \`PARADISE.setStatus("ok")\` when everything is working, or \`PARADISE.setStatus("error", "Cannot reach API")\` when there's a fault. Update status on each data refresh.
3. Call \`PARADISE.setGauge(value, "label", "unit")\` to show a live metric on the node circle. Pick a value meaningful to your role. The unit is the symbol shown after the number. Examples: \`await PARADISE.setGauge(cpu_pct, "cpu", "%")\`, \`await PARADISE.setGauge(taskCount, "tasks", "")\`. Update it alongside status on each data refresh.

Start with Step 1 now — ask your clarifying questions.`;

export function ChatTab({
  nodeId,
  api,
  visible,
  genesisPrompt,
  onGenesisComplete,
  onIdentityUpdate,
  onThinkingChange,
}: {
  nodeId: string;
  api: string;
  visible?: boolean;
  genesisPrompt?: string;
  onGenesisComplete?: () => void;
  onIdentityUpdate?: (identity: Record<string, unknown>) => void;
  onThinkingChange?: (thinking: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsUrl = api.replace(/^http/, "ws") + `/api/nodes/${nodeId}/chat`;

  const {
    messages,
    connected,
    agentReady,
    initializing,
    thinking,
    genesisInProgress,
    sendMessage,
    sendGenesis,
  } = useChatSocket({
    wsUrl,
    nodeId,
    api,
    genesisPrompt,
    onGenesisComplete,
    onIdentityUpdate,
    onThinkingChange,
    genesisTemplate: GENESIS_TEMPLATE,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, visible]);

  const send = () => {
    const text = input.trim();
    if (!text) return;

    const genesisMatch = text.match(/^\/genesis\s+(.+)/i);
    if (genesisMatch) {
      sendGenesis(genesisMatch[1]);
      setInput("");
      return;
    }

    sendMessage(text);
    setInput("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 6,
        cursor: "auto",
        userSelect: "text",
      }}
    >
      {/* Connection status */}
      <div
        style={{
          fontSize: 11,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: connected
            ? agentReady
              ? "var(--green)"
              : "var(--yellow)"
            : initializing
              ? "var(--text-muted)"
              : "var(--red)",
        }}
      >
        <span>
          {!connected
            ? initializing
              ? "initializing..."
              : "reconnecting..."
            : agentReady
              ? genesisInProgress
                ? "genesis in progress..."
                : "ready"
              : "no model configured"}
        </span>
        {connected && agentReady && !genesisInProgress && (
          <button
            onClick={() => {
              const prompt = window.prompt("Genesis prompt:");
              if (prompt?.trim()) sendGenesis(prompt.trim());
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 10,
              cursor: "pointer",
              padding: "0 4px",
              opacity: 0.6,
            }}
            title="Re-run genesis (/genesis <prompt>)"
          >
            genesis
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12,
        }}
      >
        {messages.map((m, i) => {
          const isToolCall = m.message_type === "tool_call";
          return (
            <div
              key={i}
              style={{
                padding: isToolCall ? "2px 8px" : "4px 8px",
                borderRadius: 6,
                background:
                  isToolCall
                    ? "var(--overlay-subtle)"
                    : m.role === "user"
                      ? "rgba(99, 102, 241, 0.15)"
                      : "var(--overlay-light)",
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                opacity: m.streaming ? 0.7 : isToolCall ? 0.6 : 1,
                fontFamily: isToolCall ? "monospace" : undefined,
                fontSize: isToolCall ? 10 : undefined,
                color: isToolCall ? "var(--text-muted)" : undefined,
              }}
            >
              {m.content}
            </div>
          );
        })}
        {thinking && (
          <div
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background: "var(--overlay-light)",
              alignSelf: "flex-start",
              color: "var(--text-muted)",
              fontSize: 11,
            }}
          >
            <span className="typing-dots">thinking</span>
            <style>{`
              .typing-dots::after {
                content: '';
                animation: dots 1.5s steps(4, end) infinite;
              }
              @keyframes dots {
                0% { content: ''; }
                25% { content: '.'; }
                50% { content: '..'; }
                75% { content: '...'; }
                100% { content: ''; }
              }
            `}</style>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 4 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message..."
          style={{
            flex: 1,
            background: "var(--overlay-light)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "6px 8px",
            color: "var(--text)",
            fontSize: 12,
            outline: "none",
          }}
        />
        <button
          onClick={send}
          style={{
            background: "var(--accent)",
            color: "var(--text)",
            border: "none",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
