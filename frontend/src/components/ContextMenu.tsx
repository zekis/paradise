"use client";

import { useEffect } from "react";
import Icon from "@mdi/react";
import {
  mdiContentCopy,
  mdiRestart,
  mdiWrench,
  mdiDeleteOutline,
  mdiPlus,
  mdiArchiveArrowDown,
  mdiPlay,
  mdiOpenInNew,
  mdiArrowRightBold,
} from "@mdi/js";
import { useCanvasStore } from "@/store/canvasStore";
import { useAreaStore, type Area } from "@/store/areaStore";
import { mapApiNodeToNodeData } from "@/lib/mappers";
import { resolveMdiIcon } from "@/lib/mdiIcons";
import type { NodeIdentityShortcut } from "@/types";

interface ContextMenuProps {
  position: { x: number; y: number };
  nodeId?: string;
  rebuilding?: boolean;
  archived?: boolean;
  shortcuts?: NodeIdentityShortcut[];
  isReadOnly?: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onAddBot?: () => void;
}

interface MenuItem {
  icon: string;
  label: string;
  action: () => void;
  color?: string;
  separator?: boolean;
  disabled?: boolean;
}

export function ContextMenu({ position, nodeId, rebuilding, archived, shortcuts, isReadOnly, onClose, onDelete, onAddBot }: ContextMenuProps) {
  const api = useCanvasStore((s) => s.api);
  const addNode = useCanvasStore((s) => s.addNode);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const setNodeRebuilding = useCanvasStore((s) => s.setNodeRebuilding);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);
  const areas = useAreaStore((s) => s.areas);
  const activeAreaId = useAreaStore((s) => s.activeAreaId);

  useEffect(() => {
    const dismiss = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("click", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleClone = async () => {
    if (!nodeId) return;
    onClose();
    const res = await fetch(`${api}/api/nodes/${nodeId}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return;
    const node = await res.json();
    addNode({
      id: node.id,
      position: { x: node.position_x, y: node.position_y },
      data: mapApiNodeToNodeData(node),
    });
  };

  const handleRestart = async () => {
    if (!nodeId) return;
    onClose();
    setNodeRebuilding(nodeId, true);
    setSelectedNodeId(null);
    try {
      await fetch(`${api}/api/nodes/${nodeId}/restart`, { method: "POST" });
    } finally {
      setNodeRebuilding(nodeId, false);
    }
  };

  const handleRebuild = async () => {
    if (!nodeId) return;
    onClose();
    setNodeRebuilding(nodeId, true);
    setSelectedNodeId(null);
    try {
      await fetch(`${api}/api/nodes/${nodeId}/rebuild`, { method: "POST" });
    } finally {
      setNodeRebuilding(nodeId, false);
    }
  };

  const handleArchive = async () => {
    if (!nodeId) return;
    onClose();
    setNodeRebuilding(nodeId, true);
    setSelectedNodeId(null);
    try {
      await fetch(`${api}/api/nodes/${nodeId}/archive`, { method: "POST" });
    } finally {
      setNodeRebuilding(nodeId, false);
    }
  };

  const handleResume = async () => {
    if (!nodeId) return;
    onClose();
    setNodeRebuilding(nodeId, true);
    try {
      await fetch(`${api}/api/nodes/${nodeId}/resume`, { method: "POST" });
    } finally {
      setNodeRebuilding(nodeId, false);
    }
  };

  const handleSendToArea = async (targetAreaId: string) => {
    if (!nodeId) return;
    onClose();
    try {
      const res = await fetch(`${api}/api/areas/${targetAreaId}/move-node`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: nodeId }),
      });
      if (res.ok) {
        removeNode(nodeId);
      }
    } catch (error) {
      console.warn("Failed to move node to area:", error);
    }
  };

  const otherAreas = areas.filter((a) => a.id !== activeAreaId);

  const validShortcuts = (shortcuts || [])
    .filter((s) => s.label && s.url && /^https?:\/\//i.test(s.url))
    .slice(0, 5);

  const shortcutItems: MenuItem[] = validShortcuts.map((s, i) => ({
    icon: (s.icon ? resolveMdiIcon(s.icon) : null) || mdiOpenInNew,
    label: s.label.length > 40 ? s.label.slice(0, 37) + "..." : s.label,
    action: () => {
      window.open(s.url, "_blank", "noopener,noreferrer");
      onClose();
    },
    separator: i === 0,
  }));

  const items: MenuItem[] = nodeId
    ? [
        { icon: mdiContentCopy, label: "Clone", action: handleClone, disabled: isReadOnly || archived },
        { icon: mdiRestart, label: "Restart", action: handleRestart, disabled: isReadOnly || rebuilding || archived },
        { icon: mdiWrench, label: "Rebuild", action: handleRebuild, disabled: isReadOnly || rebuilding || archived },
        ...(archived
          ? [{ icon: mdiPlay, label: "Resume", action: handleResume, disabled: isReadOnly || rebuilding }]
          : [{ icon: mdiArchiveArrowDown, label: "Archive", action: handleArchive, disabled: isReadOnly || rebuilding }]
        ),
        ...otherAreas.map((area, i) => ({
          icon: mdiArrowRightBold,
          label: `Send to ${area.name.length > 20 ? area.name.slice(0, 17) + "..." : area.name}`,
          action: () => handleSendToArea(area.id),
          separator: i === 0,
          disabled: isReadOnly,
        })),
        ...shortcutItems,
        {
          icon: mdiDeleteOutline,
          label: "Delete",
          action: () => { onClose(); onDelete?.(); },
          color: "var(--red)",
          separator: shortcutItems.length > 0 || otherAreas.length > 0,
          disabled: isReadOnly,
        },
      ]
    : [
        { icon: mdiPlus, label: "Create", action: () => { onClose(); onAddBot?.(); }, disabled: isReadOnly },
      ];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "4px 0",
        zIndex: 9999,
        minWidth: 140,
        boxShadow: "0 4px 16px var(--shadow-md)",
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.disabled ? undefined : item.action}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "6px 12px",
            background: "transparent",
            border: "none",
            borderTop: item.separator ? "1px solid var(--border)" : "none",
            color: item.color || "var(--text)",
            cursor: item.disabled ? "not-allowed" : "pointer",
            fontSize: 11,
            textAlign: "left",
            opacity: item.disabled ? 0.4 : 1,
          }}
          onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = "var(--overlay-light)"; }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Icon path={item.icon} size={0.55} color={item.color || "var(--text-muted)"} />
          {item.label}
        </button>
      ))}
    </div>
  );
}
