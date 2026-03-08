"use client";

import { useCallback, useMemo, useState } from "react";
import Icon from "@mdi/react";
import { mdiRobot } from "@mdi/js";
import type { Node } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvasStore";
import { resolveMdiIcon } from "@/lib/mdiIcons";
import { getStatusColor, getGaugeColor } from "@/lib/treeUtils";
import type { NanobotNodeData } from "@/types";
import { NetworkCommandBar } from "./NetworkCommandBar";
import { MessageAllModal } from "./MessageAllModal";

// ─── MobileNodeCard (flat) ───

function MobileNodeCard({
  node,
  selectedNodeId,
  checkedNodeIds,
  onToggleCheck,
  onItemClick,
  onContextMenu,
  isReadOnly,
}: {
  node: Node;
  selectedNodeId: string | null;
  checkedNodeIds: Set<string>;
  onToggleCheck: (id: string) => void;
  onItemClick: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, nodeId: string) => void;
  isReadOnly?: boolean;
}) {
  const data = node.data as NanobotNodeData;
  const isSelected = node.id === selectedNodeId;
  const isArchived = data.archived ?? false;
  const statusColor = getStatusColor(data.agentStatus ?? null, data.containerStatus);
  const hasGauge = data.gaugeValue != null;
  const gaugeColor = hasGauge ? getGaugeColor(data.gaugeValue!, data.gaugeWarnThreshold ?? null, data.gaugeCriticalThreshold ?? null) : undefined;
  const resolvedIcon = data.identity?.icon ? resolveMdiIcon(data.identity.icon) : null;

  return (
    <div
      onClick={() => { if (!isReadOnly) onItemClick(node.id); }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, node.id); }}
      style={{
        background: isSelected ? "rgba(99, 102, 241, 0.10)" : "var(--overlay-subtle)",
        borderRadius: 8,
        margin: "2px 8px",
        padding: "8px 10px",
        minHeight: 44,
        cursor: isReadOnly ? "default" : "pointer",
        borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
        fontSize: 14,
        opacity: isArchived ? 0.45 : 1,
        transition: "background 0.12s ease",
      }}
    >
      {/* Line 1: Checkbox + Icon + Label + Status dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
        {/* Checkbox for multi-select (hidden when read-only) */}
        {!isReadOnly && (
        <input
          type="checkbox"
          checked={checkedNodeIds.has(node.id)}
          onChange={() => onToggleCheck(node.id)}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 18,
            height: 18,
            flexShrink: 0,
            cursor: "pointer",
            accentColor: "var(--accent)",
            margin: 0,
          }}
        />
        )}

        {/* Icon */}
        {resolvedIcon ? (
          <Icon path={resolvedIcon} size={0.7} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        ) : data.identity?.emoji ? (
          <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{data.identity.emoji}</span>
        ) : (
          <Icon path={mdiRobot} size={0.7} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        )}

        {/* Label — gets full remaining width */}
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: isSelected ? "var(--text)" : "var(--text-muted)",
            fontWeight: isSelected ? 600 : 400,
            fontSize: 15,
          }}
          title={data.label}
        >
          {data.label}
        </span>

        {/* Status dot */}
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: isArchived ? "var(--text-muted)" : statusColor,
            flexShrink: 0,
            opacity: isArchived ? 0.4 : 1,
          }}
        />
      </div>

      {/* Line 2: Gauge badge (only when gauge exists) */}
      {hasGauge && (
        <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 1, marginTop: 2 }}>
          <span
            title={data.gaugeLabel ? `${data.gaugeLabel}: ${Math.round(data.gaugeValue!)}${data.gaugeUnit || ""}` : undefined}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: gaugeColor,
              background: "var(--overlay-light)",
              borderRadius: 6,
              padding: "2px 7px",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {Math.round(data.gaugeValue!)}{data.gaugeUnit || ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── MobileTreeView ───

interface MobileTreeViewProps {
  nodes: Node[];
  edges?: unknown[];
  onSelectNode: (nodeId: string) => void;
  onNodeContextMenu?: (e: React.MouseEvent, nodeId: string) => void;
  isReadOnly?: boolean;
}

export function MobileTreeView({ nodes, onSelectNode, onNodeContextMenu, isReadOnly }: MobileTreeViewProps) {
  const [showMessageModal, setShowMessageModal] = useState(false);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const checkedNodeIds = useCanvasStore((s) => s.checkedNodeIds);
  const toggleCheckedNode = useCanvasStore((s) => s.toggleCheckedNode);
  const setCheckedNodeIds = useCanvasStore((s) => s.setCheckedNodeIds);

  const allNodeIds = useMemo(
    () => nodes.filter((n) => !(n.data as NanobotNodeData)?.archived).map((n) => n.id),
    [nodes]
  );
  const allChecked = allNodeIds.length > 0 && allNodeIds.every((id) => checkedNodeIds.has(id));
  const someChecked = allNodeIds.some((id) => checkedNodeIds.has(id));

  const handleToggleAll = useCallback(() => {
    if (allChecked) {
      useCanvasStore.getState().clearCheckedNodes();
    } else {
      setCheckedNodeIds(new Set(allNodeIds));
    }
  }, [allChecked, allNodeIds, setCheckedNodeIds]);

  // Flat sorted list: alphabetical by label, archived nodes at end
  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const da = a.data as NanobotNodeData;
      const db = b.data as NanobotNodeData;
      const archivedA = da.archived ?? false;
      const archivedB = db.archived ?? false;
      if (archivedA !== archivedB) return archivedA ? 1 : -1;
      return da.label.localeCompare(db.label);
    });
  }, [nodes]);

  return (
    <>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card-header)",
          flexShrink: 0,
        }}
      >
        {!isReadOnly && (
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
          onChange={handleToggleAll}
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            cursor: "pointer",
            accentColor: "var(--accent)",
            margin: 0,
          }}
          title={allChecked ? "Deselect all" : "Select all"}
        />
        )}
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
          Nanobots
        </span>
        {nodes.length > 0 && (
          <span
            style={{
              fontSize: 10,
              background: "var(--accent)",
              color: "var(--text)",
              borderRadius: 8,
              padding: "1px 7px",
              fontWeight: 600,
            }}
          >
            {nodes.length}
          </span>
        )}
      </div>

      {/* Scrollable node list */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 2, paddingBottom: 2 }}>
        {sortedNodes.length === 0 ? (
          <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center", fontSize: 13 }}>
            No nodes
          </div>
        ) : (
          sortedNodes.map((node) => (
            <MobileNodeCard
              key={node.id}
              node={node}
              selectedNodeId={selectedNodeId}
              checkedNodeIds={checkedNodeIds}
              onToggleCheck={toggleCheckedNode}
              onItemClick={onSelectNode}
              onContextMenu={onNodeContextMenu}
              isReadOnly={isReadOnly}
            />
          ))
        )}
      </div>

      {/* Network command bar (visible when nodes are checked, hidden when read-only) */}
      {checkedNodeIds.size > 0 && !isReadOnly && (
        <NetworkCommandBar
          nodes={nodes}
          onMessageAll={() => setShowMessageModal(true)}
        />
      )}
    </div>

    {showMessageModal && !isReadOnly && (
      <MessageAllModal
        nodes={nodes}
        onClose={() => setShowMessageModal(false)}
      />
    )}
    </>
  );
}
