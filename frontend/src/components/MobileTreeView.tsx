"use client";

import { useCallback, useMemo, useState } from "react";
import Icon from "@mdi/react";
import { mdiChevronRight, mdiChevronDown, mdiRobot } from "@mdi/js";
import type { Node, Edge } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvasStore";
import { resolveMdiIcon } from "@/lib/mdiIcons";
import { buildTree, getStatusColor, getGaugeColor, type TreeNode } from "@/lib/treeUtils";
import type { NanobotNodeData } from "@/types";
import { NetworkCommandBar } from "./NetworkCommandBar";
import { MessageAllModal } from "./MessageAllModal";

// ─── MobileTreeItem (recursive) ───

function MobileTreeItem({
  node,
  depth,
  selectedNodeId,
  collapsedNodes,
  checkedNodeIds,
  onToggleCollapse,
  onToggleCheck,
  onItemClick,
  onContextMenu,
}: {
  node: TreeNode;
  depth: number;
  selectedNodeId: string | null;
  collapsedNodes: Set<string>;
  checkedNodeIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onItemClick: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, nodeId: string) => void;
}) {
  const isSelected = node.id === selectedNodeId;
  const isCollapsed = collapsedNodes.has(node.id);
  const hasChildren = node.children.length > 0;
  const isArchived = node.archived ?? false;
  const statusColor = getStatusColor(node.agentStatus, node.containerStatus);
  const hasGauge = node.gaugeValue != null;
  const gaugeColor = hasGauge ? getGaugeColor(node.gaugeValue!, node.color || null) : undefined;

  return (
    <>
      <div
        onClick={() => onItemClick(node.id)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, node.id); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingLeft: 14 + depth * 20,
          paddingRight: 14,
          minHeight: 44,
          cursor: "pointer",
          background: isSelected ? "rgba(99, 102, 241, 0.12)" : "transparent",
          borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
          fontSize: 14,
          opacity: isArchived ? 0.45 : 1,
        }}
      >
        {/* Chevron */}
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id); }}
            style={{ display: "flex", alignItems: "center", flexShrink: 0, cursor: "pointer", padding: 4 }}
          >
            <Icon path={isCollapsed ? mdiChevronRight : mdiChevronDown} size={0.7} color="var(--text-muted)" />
          </span>
        ) : (
          <span style={{ width: 22, flexShrink: 0 }} />
        )}

        {/* Checkbox for multi-select */}
        <input
          type="checkbox"
          checked={checkedNodeIds.has(node.id)}
          onChange={() => onToggleCheck(node.id)}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            cursor: "pointer",
            accentColor: "var(--accent)",
            margin: 0,
          }}
        />

        {/* Icon */}
        {node.icon && resolveMdiIcon(node.icon) ? (
          <Icon path={resolveMdiIcon(node.icon)!} size={0.7} color={node.color || "var(--text-muted)"} style={{ flexShrink: 0 }} />
        ) : node.emoji ? (
          <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{node.emoji}</span>
        ) : (
          <Icon path={mdiRobot} size={0.7} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        )}

        {/* Label */}
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: isSelected ? "var(--text)" : "var(--text-muted)",
            fontWeight: isSelected ? 600 : 400,
          }}
          title={node.label}
        >
          {node.label}
        </span>

        {/* Gauge value badge */}
        {hasGauge && (
          <span
            title={node.gaugeLabel ? `${node.gaugeLabel}: ${Math.round(node.gaugeValue!)}${node.gaugeUnit || ""}` : undefined}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: gaugeColor,
              background: "var(--overlay-light)",
              borderRadius: 8,
              padding: "2px 6px",
              lineHeight: 1.2,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {Math.round(node.gaugeValue!)}{node.gaugeUnit || ""}
          </span>
        )}

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

      {hasChildren && !isCollapsed &&
        node.children.map((child) => (
          <MobileTreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedNodeId={selectedNodeId}
            collapsedNodes={collapsedNodes}
            checkedNodeIds={checkedNodeIds}
            onToggleCollapse={onToggleCollapse}
            onToggleCheck={onToggleCheck}
            onItemClick={onItemClick}
            onContextMenu={onContextMenu}
          />
        ))
      }
    </>
  );
}

// ─── MobileTreeView ───

interface MobileTreeViewProps {
  nodes: Node[];
  edges: Edge[];
  onSelectNode: (nodeId: string) => void;
  onNodeContextMenu?: (e: React.MouseEvent, nodeId: string) => void;
}

export function MobileTreeView({ nodes, edges, onSelectNode, onNodeContextMenu }: MobileTreeViewProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [showMessageModal, setShowMessageModal] = useState(false);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const checkedNodeIds = useCanvasStore((s) => s.checkedNodeIds);
  const toggleCheckedNode = useCanvasStore((s) => s.toggleCheckedNode);
  const setCheckedNodeIds = useCanvasStore((s) => s.setCheckedNodeIds);

  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges]);

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

  const toggleNodeCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

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

      {/* Scrollable tree */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 4, paddingBottom: 4 }}>
        {tree.length === 0 ? (
          <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center", fontSize: 13 }}>
            No nodes
          </div>
        ) : (
          tree.map((node) => (
            <MobileTreeItem
              key={node.id}
              node={node}
              depth={0}
              selectedNodeId={selectedNodeId}
              collapsedNodes={collapsedNodes}
              checkedNodeIds={checkedNodeIds}
              onToggleCollapse={toggleNodeCollapse}
              onToggleCheck={toggleCheckedNode}
              onItemClick={onSelectNode}
              onContextMenu={onNodeContextMenu}
            />
          ))
        )}
      </div>

      {/* Network command bar (visible when nodes are checked) */}
      {checkedNodeIds.size > 0 && (
        <NetworkCommandBar
          nodes={nodes}
          onMessageAll={() => setShowMessageModal(true)}
        />
      )}
    </div>

    {showMessageModal && (
      <MessageAllModal
        nodes={nodes}
        onClose={() => setShowMessageModal(false)}
      />
    )}
    </>
  );
}
