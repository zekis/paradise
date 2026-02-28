"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

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

1. **identity.json** (FIRST): {"emoji": "<emoji>", "color": "<hex>", "description": "<one line>", "tabs": [{"name": "<Label>", "file": "<FILE.md>"}]}
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

**Persistence**: config.html saves settings to \`settings.json\` via PARADISE.writeFile(). api.py reads settings.json for connection params.

## Self-Naming & Status

After building, your **dashboard.html** should:
1. Call \`PARADISE.rename("short-name")\` on first load to give this node a meaningful name (e.g. "pve-03" for a Proxmox node, "weather-nyc" for a weather agent). Keep it short (under 15 chars).
2. Call \`PARADISE.setStatus("ok")\` when everything is working, or \`PARADISE.setStatus("error", "Cannot reach API")\` when there's a fault. Update status on each data refresh.

Start with Step 1 now — ask your clarifying questions.`;

// Module-level set — survives component remounts caused by React Flow re-renders
const genesisSentNodes = new Set<string>();

export function ChatTab({
  nodeId,
  api,
  genesisPrompt,
  onGenesisComplete,
  onThinkingChange,
}: {
  nodeId: string;
  api: string;
  genesisPrompt?: string;
  onGenesisComplete?: () => void;
  onThinkingChange?: (thinking: boolean) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [agentReady, setAgentReady] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [thinking, _setThinking] = useState(false);
  const setThinking = useCallback((v: boolean) => {
    _setThinking(v);
    onThinkingChange?.(v);
  }, [onThinkingChange]);
  const [genesisInProgress, setGenesisInProgress] = useState(
    !!genesisPrompt && !genesisSentNodes.has(nodeId)
  );
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const wsUrl = api.replace(/^http/, "ws") + `/api/nodes/${nodeId}/chat`;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setInitializing(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "status") {
          setAgentReady(msg.ready);
          setStatusMsg(msg.message || "");

          // Auto-send genesis prompt when agent is ready
          if (
            msg.ready &&
            genesisPrompt &&
            !genesisSentNodes.has(nodeId) &&
            ws.readyState === WebSocket.OPEN
          ) {
            genesisSentNodes.add(nodeId);
            setGenesisInProgress(true);
            setThinking(true);
            const genesisMessage = GENESIS_TEMPLATE(genesisPrompt);
            setMessages((prev) => [
              ...prev,
              { role: "user", content: `Genesis: ${genesisPrompt}` },
            ]);
            ws.send(
              JSON.stringify({
                type: "chat",
                content: genesisMessage,
                session_key: `paradise:${nodeId}`,
              })
            );
          }

          if (!msg.ready) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: msg.message || "Agent not ready" },
            ]);
          }
          return;
        }

        if (msg.type === "progress") {
          setThinking(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              return [...prev.slice(0, -1), { ...last, content: msg.content }];
            }
            return [
              ...prev,
              { role: "assistant", content: msg.content, streaming: true },
            ];
          });
        } else if (msg.type === "response") {
          setThinking(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              return [
                ...prev.slice(0, -1),
                { role: "assistant", content: msg.content },
              ];
            }
            return [...prev, { role: "assistant", content: msg.content }];
          });

          // During genesis, check if identity.json exists after each response
          if (genesisSentNodes.has(nodeId) && genesisInProgress) {
            tryFetchIdentity();
          }
        } else if (msg.type === "error") {
          // Suppress connection errors during startup
          const isConnectError = /cannot connect|connection refused|name resolution/i.test(msg.message || "");
          if (!isConnectError) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Error: ${msg.message}` },
            ]);
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after a delay
      setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, [wsUrl, genesisPrompt, nodeId, onGenesisComplete, genesisInProgress]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const tryFetchIdentity = async () => {
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/identity`);
      const data = await res.json();
      if (data.identity) {
        setGenesisInProgress(false);
        onGenesisComplete?.();
      }
    } catch {
      // ignore — identity not ready yet
    }
  };

  const sendGenesis = (prompt: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    genesisSentNodes.add(nodeId);
    setGenesisInProgress(true);
    setThinking(true);
    const genesisMessage = GENESIS_TEMPLATE(prompt);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `Genesis: ${prompt}` },
    ]);
    wsRef.current.send(
      JSON.stringify({
        type: "chat",
        content: genesisMessage,
        session_key: `paradise:${nodeId}`,
      })
    );
  };

  const send = () => {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      return;

    // /genesis <prompt> command triggers re-genesis
    const genesisMatch = text.match(/^\/genesis\s+(.+)/i);
    if (genesisMatch) {
      sendGenesis(genesisMatch[1]);
      setInput("");
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setThinking(true);
    wsRef.current.send(
      JSON.stringify({ type: "chat", content: text, session_key: `paradise:${nodeId}` })
    );
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
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background:
                m.role === "user"
                  ? "rgba(99, 102, 241, 0.15)"
                  : "rgba(255, 255, 255, 0.05)",
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              opacity: m.streaming ? 0.7 : 1,
            }}
          >
            {m.content}
          </div>
        ))}
        {thinking && (
          <div
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background: "rgba(255, 255, 255, 0.05)",
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
            background: "rgba(255,255,255,0.06)",
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
            color: "#fff",
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
