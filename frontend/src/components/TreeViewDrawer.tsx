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
import { buildTree, getStatusColor, getGaugeColor, type TreeNode } from "@/lib/treeUtils";
import type { NanobotNodeData } from "@/types";
import { NetworkCommandBar } from "./NetworkCommandBar";
import { MessageAllModal } from "./MessageAllModal";

const DRAWER_WIDTH = 240;
const TAB_WIDTH = 24;

// ─── TreeItem (recursive) ───

function TreeItem({
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

  const effectiveDepth = Math.min(depth, 4);

  return (
    <>
      {/* Card container */}
      <div
        onClick={() => onItemClick(node.id)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, node.id); }}
        onMouseOver={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--overlay-light)";
        }}
        onMouseOut={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--overlay-subtle)";
        }}
        style={{
          background: isSelected ? "rgba(99, 102, 241, 0.10)" : "var(--overlay-subtle)",
          borderRadius: 6,
          margin: "1px 4px",
          marginLeft: 4 + effectiveDepth * 10,
          padding: "4px 6px",
          cursor: "pointer",
          borderLeft: isSelected
            ? "2px solid var(--accent)"
            : depth >= 1
              ? "2px solid var(--border)"
              : "2px solid transparent",
          fontSize: 12,
          opacity: isArchived ? 0.45 : 1,
          transition: "background 0.12s ease",
        }}
      >
        {/* Line 1: Controls + Label + Status dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 20 }}>
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

          {/* Checkbox for multi-select */}
          <input
            type="checkbox"
            checked={checkedNodeIds.has(node.id)}
            onChange={() => onToggleCheck(node.id)}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 13,
              height: 13,
              flexShrink: 0,
              cursor: "pointer",
              accentColor: "var(--accent)",
              margin: 0,
            }}
          />

          {/* Icon badge */}
          {node.icon && resolveMdiIcon(node.icon) ? (
            <Icon path={resolveMdiIcon(node.icon)!} size={0.55} color={node.color || "var(--text-muted)"} style={{ flexShrink: 0 }} />
          ) : node.emoji ? (
            <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{node.emoji}</span>
          ) : (
            <Icon path={mdiRobot} size={0.55} color="var(--text-muted)" style={{ flexShrink: 0 }} />
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

        {/* Line 2: Gauge badge (only when gauge exists) */}
        {hasGauge && (
          <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 1, marginTop: 1 }}>
            <span
              title={node.gaugeLabel ? `${node.gaugeLabel}: ${Math.round(node.gaugeValue!)}${node.gaugeUnit || ""}` : undefined}
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: gaugeColor,
                background: "var(--overlay-light)",
                borderRadius: 4,
                padding: "1px 5px",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              {Math.round(node.gaugeValue!)}{node.gaugeUnit || ""}
            </span>
          </div>
        )}
      </div>

      {hasChildren && !isCollapsed &&
        node.children.map((child) => (
          <TreeItem
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
  const [showMessageModal, setShowMessageModal] = useState(false);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <>
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
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
              onChange={handleToggleAll}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 13,
                height: 13,
                flexShrink: 0,
                cursor: "pointer",
                accentColor: "var(--accent)",
                margin: 0,
              }}
              title={allChecked ? "Deselect all" : "Select all"}
            />
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
        <div style={{ flex: 1, overflowY: "auto", paddingTop: 2, paddingBottom: 2 }}>
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
                checkedNodeIds={checkedNodeIds}
                onToggleCollapse={toggleNodeCollapse}
                onToggleCheck={toggleCheckedNode}
                onItemClick={handleItemClick}
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

    {showMessageModal && (
      <MessageAllModal
        nodes={nodes}
        onClose={() => setShowMessageModal(false)}
      />
    )}
    </>
  );
}
