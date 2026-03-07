"use client";

import { useCallback, useEffect, useState } from "react";
import { useCanvasStore } from "@/store/canvasStore";

interface NodeStats {
  container_id: string;
  status: string;
  name: string;
  created_at: string | null;
  stats: {
    cpu_percent: number;
    memory_usage_mb: number;
    memory_limit_mb: number;
    memory_percent: number;
  } | null;
}

export function InfoTab({ nodeId, api }: { nodeId: string; api: string }) {
  const [info, setInfo] = useState<NodeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const setNodeRebuilding = useCanvasStore((s) => s.setNodeRebuilding);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/stats`);
      const data = await res.json();
      setInfo(data);
    } catch (error) {
      console.error(`Failed to fetch node stats for node ${nodeId}:`, error);
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [api, nodeId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading)
    return <div style={{ color: "var(--text-muted)" }}>Loading...</div>;

  if (!info)
    return <div style={{ color: "var(--red)" }}>Failed to load stats</div>;

  const statusColor =
    info.status === "running"
      ? "var(--text-muted)"
      : info.status === "exited"
        ? "var(--red)"
        : "var(--yellow)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Row label="Status">
        <span style={{ color: statusColor, fontWeight: 600 }}>
          {info.status}
        </span>
      </Row>
      <Row label="Container">{info.container_id}</Row>
      <Row label="Name">{info.name}</Row>
      {info.created_at && (
        <Row label="Created">{new Date(info.created_at).toLocaleString()}</Row>
      )}

      {info.stats && (
        <>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              margin: "4px 0",
            }}
          />
          <Row label="CPU">{info.stats.cpu_percent}%</Row>
          <Row label="Memory">
            {info.stats.memory_usage_mb} MB / {info.stats.memory_limit_mb} MB (
            {info.stats.memory_percent}%)
          </Row>
          <ProgressBar
            value={info.stats.memory_percent}
            color="var(--accent)"
          />
        </>
      )}

      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        <button
          onClick={async () => {
            setNodeRebuilding(nodeId, true);
            setSelectedNodeId(null);
            try {
              await fetch(`${api}/api/nodes/${nodeId}/restart`, { method: "POST" });
            } finally {
              setNodeRebuilding(nodeId, false);
            }
          }}
          style={{
            background: "transparent",
            color: "var(--yellow)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "4px 12px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Restart
        </button>
        <button
          onClick={async () => {
            if (!confirm("Rebuild container from current image? This will reset the container but preserve your config.")) return;
            setNodeRebuilding(nodeId, true);
            setSelectedNodeId(null);
            try {
              await fetch(`${api}/api/nodes/${nodeId}/rebuild`, { method: "POST" });
            } finally {
              setNodeRebuilding(nodeId, false);
            }
          }}
          style={{
            background: "transparent",
            color: "var(--accent)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "4px 12px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Rebuild
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        height: 4,
        background: "var(--overlay-medium)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(value, 100)}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}
