"use client";

import { useState } from "react";
import Icon from "@mdi/react";
import { mdiMessageText, mdiSend } from "@mdi/js";
import type { Node } from "@xyflow/react";
import type { NanobotNodeData } from "@/types";
import { useCanvasStore } from "@/store/canvasStore";

interface MessageAllModalProps {
  nodes: Node[];
  onClose: () => void;
}

export function MessageAllModal({ nodes, onClose }: MessageAllModalProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ nodeId: string; label: string; status: "ok" | "error" }[] | null>(null);

  const api = useCanvasStore((s) => s.api);
  const checkedNodeIds = useCanvasStore((s) => s.checkedNodeIds);
  const clearCheckedNodes = useCanvasStore((s) => s.clearCheckedNodes);

  const targetNodes = nodes.filter(
    (n) => checkedNodeIds.has(n.id) && !(n.data as NanobotNodeData)?.archived
  );

  const handleSend = async () => {
    const text = message.trim();
    if (!text || sending || targetNodes.length === 0) return;
    setSending(true);

    const outcomes = await Promise.allSettled(
      targetNodes.map(async (n) => {
        const res = await fetch(`${api}/api/nodes/${n.id}/exec`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
    );

    const summary = targetNodes.map((n, i) => ({
      nodeId: n.id,
      label: (n.data as NanobotNodeData)?.label || n.id,
      status: outcomes[i].status === "fulfilled" ? ("ok" as const) : ("error" as const),
    }));

    setResults(summary);
    setSending(false);
    clearCheckedNodes();
  };

  return (
    <div
      className="nodrag nowheel"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--backdrop)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "20px 24px",
          width: 340,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 8px 24px var(--shadow-md)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon path={mdiMessageText} size={0.8} color="var(--accent)" />
          <div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Message All</span>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Send to {targetNodes.length} node{targetNodes.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {results ? (
          <>
            <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              {results.map((r) => (
                <div key={r.nodeId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: r.status === "ok" ? "var(--green)" : "var(--red)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: "var(--text-muted)" }}>{r.label}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button
                onClick={onClose}
                style={{
                  background: "var(--accent)",
                  color: "var(--text)",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              placeholder='e.g., "update dashboards"'
              autoFocus
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "10px 12px",
                color: "var(--text)",
                fontSize: 13,
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim() || sending}
                style={{
                  background: message.trim() ? "var(--accent)" : "var(--overlay-medium)",
                  color: message.trim() ? "var(--text)" : "var(--text-muted)",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: message.trim() && !sending ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: sending ? 0.6 : 1,
                }}
              >
                <Icon path={mdiSend} size={0.5} />
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
