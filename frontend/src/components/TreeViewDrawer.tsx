"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@mdi/react";
import {
  mdiFileTreeOutline,
  mdiChevronRight,
  mdiChevronDown,
  mdiRobot,
  mdiPin,
  mdiPinOutline,
} from "@mdi/js";
import type { Node, Edge } from "@xyflow/react";
import { useCanvasStore } from "@/store/canvasStore";
import { resolveMdiIcon } from "@/lib/mdiIcons";
import { buildTree, getStatusColor, type TreeNode } from "@/lib/treeUtils";

const DRAWER_WIDTH = 240;
const TAB_WIDTH = 24;

// ─── TreeItem (recursive) ───

function TreeItem({
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
        onMouseOver={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--overlay-subtle)";
        }}
        onMouseOut={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingLeft: 8 + depth * 16,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          cursor: "pointer",
          background: isSelected ? "rgba(99, 102, 241, 0.12)" : "transparent",
          borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
          fontSize: 12,
          opacity: isArchived ? 0.45 : 1,
        }}
      >
        {/* Chevron for expand/collapse */}
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id); }}
            style={{ display: "flex", alignItems: "center", flexShrink: 0, cursor: "pointer" }}
          >
            <Icon path={isCollapsed ? mdiChevronRight : mdiChevronDown} size={0.55} color="var(--text-muted)" />
          </span>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}

        {/* Icon badge */}
        {node.icon && resolveMdiIcon(node.icon) ? (
          <Icon path={resolveMdiIcon(node.icon)!} size={0.55} color={node.color || "var(--text-muted)"} style={{ flexShrink: 0 }} />
        ) : node.emoji ? (
          <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{node.emoji}</span>
        ) : (
          <Icon path={mdiRobot} size={0.55} color="var(--text-muted)" style={{ flexShrink: 0 }} />
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
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: isArchived ? "var(--text-muted)" : statusColor,
            flexShrink: 0,
            opacity: isArchived ? 0.4 : 1,
          }}
        />
      </div>

      {hasChildren && !isCollapsed &&
        node.children.map((child) => (
          <TreeItem
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

// ─── TreeViewDrawer ───

interface TreeViewDrawerProps {
  nodes: Node[];
  edges: Edge[];
  onFocusNode: (nodeId: string) => void;
  onOpenChange?: (open: boolean) => void;
  onNodeContextMenu?: (e: React.MouseEvent, nodeId: string) => void;
}

export function TreeViewDrawer({ nodes, edges, onFocusNode, onOpenChange, onNodeContextMenu }: TreeViewDrawerProps) {
  const [expanded, setExpanded] = useState(true);
  const [pinned, setPinned] = useState(true);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);

  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges]);

  useEffect(() => {
    onOpenChange?.(expanded);
  }, [expanded, onOpenChange]);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    setExpanded(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!pinned) {
      leaveTimeoutRef.current = setTimeout(() => setExpanded(false), 600);
    }
  }, [pinned]);

  const handleTogglePin = useCallback(() => {
    setPinned((p) => {
      if (p) {
        leaveTimeoutRef.current = setTimeout(() => setExpanded(false), 600);
      }
      return !p;
    });
    setExpanded(true);
  }, []);

  const toggleNodeCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const handleItemClick = useCallback((nodeId: string) => {
    onFocusNode(nodeId);
  }, [onFocusNode]);

  const translateX = expanded ? 0 : -(DRAWER_WIDTH - TAB_WIDTH);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: DRAWER_WIDTH,
        height: "100vh",
        transform: `translateX(${translateX}px)`,
        transition: "transform 0.25s ease",
        background: "var(--bg-card)",
        borderRight: "1px solid var(--border)",
        zIndex: 2000,
        display: "flex",
        flexDirection: "row",
        boxShadow: expanded ? "4px 0 16px var(--shadow-sm)" : undefined,
      }}
    >
      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div
          onClick={handleTogglePin}
          style={{
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            background: "var(--bg-card-header)",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", opacity: 0.6, letterSpacing: 2 }}>
              PARADISE
            </span>
            {nodes.length > 0 && (
              <span
                style={{
                  fontSize: 9,
                  background: "var(--accent)",
                  color: "var(--text)",
                  borderRadius: 8,
                  padding: "1px 6px",
                  fontWeight: 600,
                }}
              >
                {nodes.length}
              </span>
            )}
          </div>
          <Icon
            path={pinned ? mdiPin : mdiPinOutline}
            size={0.5}
            color="var(--text-muted)"
          />
        </div>

        {/* Scrollable tree */}
        <div style={{ flex: 1, overflowY: "auto", paddingTop: 4, paddingBottom: 4 }}>
          {tree.length === 0 ? (
            <div style={{ padding: 12, color: "var(--text-muted)", textAlign: "center", fontSize: 11 }}>
              No nodes
            </div>
          ) : (
            tree.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedNodeId={selectedNodeId}
                collapsedNodes={collapsedNodes}
                onToggleCollapse={toggleNodeCollapse}
                onItemClick={handleItemClick}
                onContextMenu={onNodeContextMenu}
              />
            ))
          )}
        </div>
      </div>

      {/* Tab handle (rightmost strip, visible when collapsed) */}
      <div
        style={{
          width: TAB_WIDTH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          opacity: expanded ? 0.3 : 0.5,
          transition: "opacity 0.15s",
        }}
      >
        <Icon path={mdiFileTreeOutline} size={0.55} color="var(--text-muted)" />
      </div>
    </div>
  );
}
