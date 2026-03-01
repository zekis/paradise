"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import Icon from "@mdi/react";
import { mdiRobot } from "@mdi/js";
import { useCanvasStore } from "@/store/canvasStore";
import type { NanobotNodeData, NanobotFlowNode } from "@/types";

function getStatusColor(agentStatus: string | null, containerStatus: string | null): string {
  if (agentStatus) {
    switch (agentStatus) {
      case "ok": return "var(--green)";
      case "warning": return "var(--yellow)";
      case "error": return "var(--red)";
      default: return "var(--green)";
    }
  }
  switch (containerStatus) {
    case "running": return "var(--green)";
    case "error": return "var(--red)";
    default: return "var(--yellow)";
  }
}

const GAUGE_SIZE = 56;
const GAUGE_STROKE = 3;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function GaugeRing({ value, color }: { value: number; color: string }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const offset = GAUGE_CIRCUMFERENCE - (clamped / 100) * GAUGE_CIRCUMFERENCE;
  return (
    <svg
      width={GAUGE_SIZE}
      height={GAUGE_SIZE}
      style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)", pointerEvents: "none" }}
    >
      <circle
        cx={GAUGE_SIZE / 2}
        cy={GAUGE_SIZE / 2}
        r={GAUGE_RADIUS}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={GAUGE_STROKE}
      />
      <circle
        cx={GAUGE_SIZE / 2}
        cy={GAUGE_SIZE / 2}
        r={GAUGE_RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={GAUGE_STROKE}
        strokeLinecap="round"
        strokeDasharray={GAUGE_CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1s ease-in-out" }}
      />
    </svg>
  );
}

function getGaugeColor(value: number, identityColor: string | null): string {
  if (value > 80) return "var(--red)";
  if (value > 60) return "var(--yellow)";
  return identityColor || "var(--accent)";
}

const KEYFRAMES = `
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(1.3); }
  }
  @keyframes genesis-orbit-circle {
    from { transform: rotate(0deg) translateX(30px); }
    to { transform: rotate(360deg) translateX(30px); }
  }
`;

export function NanobotNode({ data }: NodeProps<NanobotFlowNode>) {
  const d = data as NanobotNodeData;
  const { nodeId, containerStatus, identity, agentStatus, agentStatusMessage, genesisActive, gaugeValue, gaugeLabel } = d;

  const { selectedNodeId, setSelectedNodeId } = useCanvasStore();

  const statusColor = getStatusColor(agentStatus, containerStatus);
  const identityColor = identity?.color || null;
  const isSelected = selectedNodeId === nodeId;
  const hasGauge = gaugeValue != null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        cursor: "pointer",
        width: 80,
      }}
      onClick={() => setSelectedNodeId(nodeId)}
    >
      <Handle type="target" position={Position.Top} id="top-t" style={{ top: -8 }} />
      <Handle type="source" position={Position.Top} id="top-s" style={{ top: -8 }} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" />
      <Handle type="source" position={Position.Bottom} id="bottom-s" />
      <Handle type="target" position={Position.Left} id="left-t" />
      <Handle type="source" position={Position.Left} id="left-s" />
      <Handle type="target" position={Position.Right} id="right-t" />
      <Handle type="source" position={Position.Right} id="right-s" />
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: identityColor ? `${identityColor}15` : "var(--bg-card)",
          border: `2px solid ${isSelected ? "var(--accent)" : identityColor || "var(--border)"}`,
          boxShadow: isSelected ? "0 0 0 2px var(--accent)" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
        title={hasGauge ? `${gaugeLabel ? gaugeLabel + ": " : ""}${Math.round(gaugeValue!)}%` : undefined}
      >
        {hasGauge && (
          <GaugeRing value={gaugeValue!} color={getGaugeColor(gaugeValue!, identityColor)} />
        )}
        {identity?.emoji ? (
          <span style={{ fontSize: 24, lineHeight: 1 }}>{identity.emoji}</span>
        ) : (
          <Icon path={mdiRobot} size={1.1} color="var(--text-muted)" />
        )}
        <span
          style={{
            position: "absolute",
            bottom: 2,
            right: 2,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: statusColor,
            border: "2px solid var(--bg-card)",
          }}
          title={agentStatusMessage || undefined}
        />
        {genesisActive && [0, 1, 2].map((i) => (
          <div
            key={`gp-${i}`}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 2 + (i % 2),
              height: 2 + (i % 2),
              marginTop: -(1 + (i % 2) * 0.5),
              marginLeft: -(1 + (i % 2) * 0.5),
              borderRadius: "50%",
              background: identityColor || "var(--accent)",
              boxShadow: `0 0 4px 1px ${identityColor || "var(--accent)"}`,
              animation: "genesis-orbit-circle 3s linear infinite",
              animationDelay: `${i}s`,
              pointerEvents: "none" as const,
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          textAlign: "center",
          width: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={identity?.description || undefined}
      >
        {d.label}
      </span>
      <style>{KEYFRAMES}</style>
    </div>
  );
}
