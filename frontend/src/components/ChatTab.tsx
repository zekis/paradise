"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export function ChatTab({ nodeId, api }: { nodeId: string; api: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [agentReady, setAgentReady] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [initializing, setInitializing] = useState(true);
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
          if (!msg.ready) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: msg.message || "Agent not ready" },
            ]);
          }
          return;
        }

        if (msg.type === "progress") {
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
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
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
      }}
    >
      {/* Connection status */}
      <div
        style={{
          fontSize: 11,
          color: connected
            ? agentReady
              ? "var(--green)"
              : "var(--yellow)"
            : initializing
              ? "var(--text-muted)"
              : "var(--red)",
        }}
      >
        {!connected
          ? initializing
            ? "initializing..."
            : "reconnecting..."
          : agentReady
            ? "ready"
            : "no model configured"}
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
