"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function LogsTab({ nodeId, api }: { nodeId: string; api: string }) {
  const [logs, setLogs] = useState("");
  const tail = 100;
  const logRef = useRef<HTMLPreElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/logs?tail=${tail}`);
      const data = await res.json();
      setLogs(data.logs || "No logs available");
    } catch (error) {
      console.error(`Failed to fetch logs for node ${nodeId}:`, error);
      setLogs("Failed to fetch logs");
    }
  }, [api, nodeId, tail]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Last {tail} lines (auto-refresh 5s)
        </span>
        <button
          onClick={load}
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>
      <pre
        ref={logRef}
        style={{
          flex: 1,
          background: "var(--input-bg)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: 8,
          color: "var(--text)",
          fontSize: 10,
          fontFamily: "monospace",
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          margin: 0,
        }}
      >
        {logs}
      </pre>
    </div>
  );
}
