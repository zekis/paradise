"use client";

import { useCallback, useState } from "react";
import Icon from "@mdi/react";
import { mdiWrench, mdiRestart, mdiMessageText, mdiClose } from "@mdi/js";
import type { Node } from "@xyflow/react";
import type { NanobotNodeData } from "@/types";
import { useCanvasStore } from "@/store/canvasStore";

interface NetworkCommandBarProps {
  nodes: Node[];
  onMessageAll: () => void;
}

const btnStyle = (busy: boolean, count: number): React.CSSProperties => ({
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "5px 0",
  fontSize: 10,
  fontWeight: 500,
  background: busy ? "var(--overlay-medium)" : "var(--overlay-light)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text)",
  cursor: busy || count === 0 ? "not-allowed" : "pointer",
  opacity: busy || count === 0 ? 0.5 : 1,
});

export function NetworkCommandBar({ nodes, onMessageAll }: NetworkCommandBarProps) {
  const [busy, setBusy] = useState(false);
  const api = useCanvasStore((s) => s.api);
  const checkedNodeIds = useCanvasStore((s) => s.checkedNodeIds);
  const setNodeRebuilding = useCanvasStore((s) => s.setNodeRebuilding);
  const clearCheckedNodes = useCanvasStore((s) => s.clearCheckedNodes);

  const targetNodes = nodes.filter(
    (n) => checkedNodeIds.has(n.id) && !(n.data as NanobotNodeData)?.archived
  );
  const count = targetNodes.length;

  const handleBulkAction = useCallback(
    async (action: "rebuild" | "restart") => {
      if (busy || count === 0) return;
      setBusy(true);
      for (const n of targetNodes) setNodeRebuilding(n.id, true);

      await Promise.allSettled(
        targetNodes.map((n) =>
          fetch(`${api}/api/nodes/${n.id}/${action}`, { method: "POST" })
        )
      );

      for (const n of targetNodes) setNodeRebuilding(n.id, false);
      clearCheckedNodes();
      setBusy(false);
    },
    [api, busy, count, targetNodes, setNodeRebuilding, clearCheckedNodes]
  );

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-card-header)",
        padding: "6px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>
          {count} selected
        </span>
        <button
          onClick={clearCheckedNodes}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 0,
            lineHeight: 0,
          }}
          title="Clear selection"
        >
          <Icon path={mdiClose} size={0.45} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={() => handleBulkAction("rebuild")}
          disabled={busy || count === 0}
          style={btnStyle(busy, count)}
          title="Rebuild all selected nodes"
        >
          <Icon path={mdiWrench} size={0.45} />
          Rebuild
        </button>

        <button
          onClick={() => handleBulkAction("restart")}
          disabled={busy || count === 0}
          style={btnStyle(busy, count)}
          title="Restart all selected nodes"
        >
          <Icon path={mdiRestart} size={0.45} />
          Restart
        </button>

        <button
          onClick={onMessageAll}
          disabled={busy || count === 0}
          style={btnStyle(busy, count)}
          title="Send message to all selected nodes"
        >
          <Icon path={mdiMessageText} size={0.45} />
          Message
        </button>
      </div>
    </div>
  );
}
