"use client";

import { useEffect } from "react";
import Icon from "@mdi/react";
import {
  mdiContentCopy,
  mdiRestart,
  mdiWrench,
  mdiDeleteOutline,
  mdiPlus,
} from "@mdi/js";
import { useCanvasStore } from "@/store/canvasStore";
import { mapApiNodeToNodeData } from "@/lib/mappers";

interface ContextMenuProps {
  position: { x: number; y: number };
  nodeId?: string;
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
}

export function ContextMenu({ position, nodeId, onClose, onDelete, onAddBot }: ContextMenuProps) {
  const api = useCanvasStore((s) => s.api);
  const addNode = useCanvasStore((s) => s.addNode);

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
    await fetch(`${api}/api/nodes/${nodeId}/restart`, { method: "POST" });
  };

  const handleRebuild = async () => {
    if (!nodeId) return;
    onClose();
    await fetch(`${api}/api/nodes/${nodeId}/rebuild`, { method: "POST" });
  };

  const items: MenuItem[] = nodeId
    ? [
        { icon: mdiContentCopy, label: "Clone", action: handleClone },
        { icon: mdiRestart, label: "Restart", action: handleRestart },
        { icon: mdiWrench, label: "Rebuild", action: handleRebuild },
        {
          icon: mdiDeleteOutline,
          label: "Delete",
          action: () => { onClose(); onDelete?.(); },
          color: "var(--red)",
          separator: true,
        },
      ]
    : [
        { icon: mdiPlus, label: "Create", action: () => { onClose(); onAddBot?.(); } },
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
          onClick={item.action}
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
            cursor: "pointer",
            fontSize: 11,
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--overlay-light)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Icon path={item.icon} size={0.55} color={item.color || "var(--text-muted)"} />
          {item.label}
        </button>
      ))}
    </div>
  );
}
