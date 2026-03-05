"use client";

import { useCallback, useMemo, useState } from "react";
import Icon from "@mdi/react";
import { mdiChevronRight, mdiChevronDown, mdiRobot } from "@mdi/js";
import type { Node, Edge } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvasStore";
import { resolveMdiIcon } from "@/lib/mdiIcons";
import { buildTree, getStatusColor, type TreeNode } from "@/lib/treeUtils";

// ─── MobileTreeItem (recursive) ───

function MobileTreeItem({
  node,
  depth,
  selectedNodeId,
  collapsedNodes,
  onToggleCollapse,
  onItemClick,
  onContextMenu,
}: {
  node: TreeNode;
  depth: number;
  selectedNodeId: string | null;
  collapsedNodes: Set<string>;
  onToggleCollapse: (id: string) => void;
  onItemClick: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, nodeId: string) => void;
}) {
  const isSelected = node.id === selectedNodeId;
  const isCollapsed = collapsedNodes.has(node.id);
  const hasChildren = node.children.length > 0;
  const isArchived = node.archived ?? false;
  const statusColor = getStatusColor(node.agentStatus, node.containerStatus);

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
            onToggleCollapse={onToggleCollapse}
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
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);

  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges]);

  const toggleNodeCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  return (
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
              onToggleCollapse={toggleNodeCollapse}
              onItemClick={onSelectNode}
              onContextMenu={onNodeContextMenu}
            />
          ))
        )}
      </div>
    </div>
  );
}
