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
import type { NanobotNodeData } from "@/types";

const DRAWER_WIDTH = 240;
const TAB_WIDTH = 24;

// ─── Tree data types ───

interface TreeNode {
  id: string;
  label: string;
  emoji?: string;
  color?: string;
  agentStatus: string | null;
  containerStatus: string | null;
  children: TreeNode[];
}

// ─── Status color (same logic as NanobotNode) ───

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

// ─── Build tree from flat nodes + edges ───

function buildTree(nodes: Node[], edges: Edge[]): TreeNode[] {
  if (nodes.length === 0) return [];

  const nodeMap = new Map<string, Node>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Build parent -> children map from edges
  const childrenMap = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of edges) {
    const children = childrenMap.get(edge.source) || [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
    hasParent.add(edge.target);
  }

  const claimed = new Set<string>();

  function buildNode(id: string, visited: Set<string>): TreeNode | null {
    if (claimed.has(id) || visited.has(id)) return null;
    const node = nodeMap.get(id);
    if (!node) return null;

    claimed.add(id);
    visited.add(id);

    const data = node.data as NanobotNodeData;
    const childIds = childrenMap.get(id) || [];
    const children: TreeNode[] = [];

    for (const childId of childIds) {
      const child = buildNode(childId, new Set(visited));
      if (child) children.push(child);
    }

    children.sort((a, b) => a.label.localeCompare(b.label));

    return {
      id,
      label: data.label,
      emoji: data.identity?.emoji,
      color: data.identity?.color,
      agentStatus: data.agentStatus ?? null,
      containerStatus: data.containerStatus ?? null,
      children,
    };
  }

  // Roots: nodes with no incoming edges
  const rootIds = nodes
    .filter((n) => !hasParent.has(n.id))
    .map((n) => n.id)
    .sort((a, b) => {
      const la = (nodeMap.get(a)?.data as NanobotNodeData)?.label || "";
      const lb = (nodeMap.get(b)?.data as NanobotNodeData)?.label || "";
      return la.localeCompare(lb);
    });

  const result: TreeNode[] = [];
  for (const rootId of rootIds) {
    const node = buildNode(rootId, new Set());
    if (node) result.push(node);
  }

  // Any unclaimed nodes (part of a cycle with no external root)
  for (const n of nodes) {
    if (!claimed.has(n.id)) {
      const node = buildNode(n.id, new Set());
      if (node) result.push(node);
    }
  }

  return result;
}

// ─── TreeItem (recursive) ───

function TreeItem({
  node,
  depth,
  selectedNodeId,
  collapsedNodes,
  onToggleCollapse,
  onItemClick,
}: {
  node: TreeNode;
  depth: number;
  selectedNodeId: string | null;
  collapsedNodes: Set<string>;
  onToggleCollapse: (id: string) => void;
  onItemClick: (id: string) => void;
}) {
  const isSelected = node.id === selectedNodeId;
  const isCollapsed = collapsedNodes.has(node.id);
  const hasChildren = node.children.length > 0;
  const statusColor = getStatusColor(node.agentStatus, node.containerStatus);

  return (
    <>
      <div
        onClick={() => onItemClick(node.id)}
        onMouseOver={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
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

        {/* Emoji or robot icon */}
        {node.emoji ? (
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
            background: statusColor,
            flexShrink: 0,
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
}

export function TreeViewDrawer({ nodes, edges, onFocusNode, onOpenChange }: TreeViewDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
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
        boxShadow: expanded ? "4px 0 16px rgba(0, 0, 0, 0.3)" : undefined,
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
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
              Nodes
            </span>
            {nodes.length > 0 && (
              <span
                style={{
                  fontSize: 9,
                  background: "var(--accent)",
                  color: "#fff",
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
