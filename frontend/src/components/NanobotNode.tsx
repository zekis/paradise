"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import Icon from "@mdi/react";
import { mdiRobot } from "@mdi/js";
import { useCanvasStore } from "@/store/canvasStore";
import { resolveMdiIcon } from "@/lib/mdiIcons";
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

function isNodeHealthy(agentStatus: string | null, containerStatus: string | null): boolean {
  if (agentStatus === "ok") return true;
  if (agentStatus === null && containerStatus === "running") return true;
  return false;
}

function getCircleColor(agentStatus: string | null, containerStatus: string | null): string | null {
  if (isNodeHealthy(agentStatus, containerStatus)) return null;
  if (agentStatus === "error" || containerStatus === "error") return "var(--red)";
  return "var(--yellow)";
}

const GAUGE_SIZE = 56;
const GAUGE_STROKE = 3;
const BORDER_WIDTH = 2;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function GaugeRing({ value, color }: { value: number; color: string }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const offset = GAUGE_CIRCUMFERENCE - (clamped / 100) * GAUGE_CIRCUMFERENCE;
  return (
    <svg
      width={GAUGE_SIZE}
      height={GAUGE_SIZE}
      style={{ position: "absolute", top: -BORDER_WIDTH, left: -BORDER_WIDTH, transform: "rotate(-90deg)", pointerEvents: "none" }}
    >
      <circle
        cx={GAUGE_SIZE / 2}
        cy={GAUGE_SIZE / 2}
        r={GAUGE_RADIUS}
        fill="none"
        stroke="var(--overlay-light)"
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
  @keyframes rebuild-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

export function NanobotNode({ data }: NodeProps<NanobotFlowNode>) {
  const d = data as NanobotNodeData;
  const { nodeId, containerStatus, identity, agentStatus, agentStatusMessage, genesisActive, rebuilding, gaugeValue, gaugeLabel, gaugeUnit } = d;

  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);

  const statusColor = getStatusColor(agentStatus, containerStatus);
  const identityColor = identity?.color || null;
  const circleColor = getCircleColor(agentStatus, containerStatus);
  const isSelected = selectedNodeId === nodeId;
  const hasGauge = gaugeValue != null;
  const resolvedIcon = identity?.icon ? resolveMdiIcon(identity.icon) : null;
  const hasIconBadge = !!(resolvedIcon || identity?.emoji);
  const gaugeColor = hasGauge ? getGaugeColor(gaugeValue!, identityColor) : undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        cursor: rebuilding ? "not-allowed" : "pointer",
        width: 80,
        overflow: "visible",
        opacity: rebuilding ? 0.6 : 1,
        transition: "opacity 0.3s ease",
      }}
      onClick={() => { if (!rebuilding) setSelectedNodeId(nodeId); }}
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
          background: circleColor ? `${circleColor}15` : "var(--bg-card)",
          border: `${BORDER_WIDTH}px solid ${isSelected ? "var(--accent)" : circleColor || "var(--border)"}`,
          boxShadow: isSelected ? "0 0 0 2px var(--accent)" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          transition: "border-color 0.15s, box-shadow 0.15s",
          overflow: "visible",
        }}
        title={hasGauge ? `${gaugeLabel ? gaugeLabel + ": " : ""}${Math.round(gaugeValue!)}${gaugeUnit || ""}` : undefined}
      >
        {hasGauge && (
          <GaugeRing value={gaugeValue!} color={gaugeColor!} />
        )}
        {/* Icon badge — top-left, outside circle */}
        {hasIconBadge && (
          <div
            style={{
              position: "absolute",
              top: -6,
              left: -6,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--bg-card)",
              border: `1.5px solid ${identityColor || "var(--border)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
            }}
          >
            {resolvedIcon ? (
              <Icon path={resolvedIcon} size={0.45} color={identityColor || "var(--text-muted)"} />
            ) : (
              <span style={{ fontSize: 10, lineHeight: 1 }}>{identity?.emoji}</span>
            )}
          </div>
        )}
        {/* Circle center — gauge value or fallback icon */}
        {hasGauge ? (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: gaugeColor,
              lineHeight: 1,
              zIndex: 1,
              position: "relative",
            }}
          >
            {Math.round(gaugeValue!)}{gaugeUnit || ""}
          </span>
        ) : (
          <Icon path={resolvedIcon || mdiRobot} size={1.1} color="var(--text-muted)" />
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
        {rebuilding && (
          <svg
            width={GAUGE_SIZE + 4}
            height={GAUGE_SIZE + 4}
            style={{
              position: "absolute",
              top: -(BORDER_WIDTH + 2),
              left: -(BORDER_WIDTH + 2),
              animation: "rebuild-spin 1.5s linear infinite",
              pointerEvents: "none",
            }}
          >
            <circle
              cx={(GAUGE_SIZE + 4) / 2}
              cy={(GAUGE_SIZE + 4) / 2}
              r={(GAUGE_SIZE + 4) / 2 - 2}
              fill="none"
              stroke="var(--yellow)"
              strokeWidth={2}
              strokeDasharray="12 8"
              strokeLinecap="round"
            />
          </svg>
        )}
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
