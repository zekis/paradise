"use client";

import Icon from "@mdi/react";
import { mdiDeleteOutline } from "@mdi/js";
import { useCanvasStore } from "@/store/canvasStore";

interface DeleteConfirmModalProps {
  nodeId: string;
  label: string;
  onClose: () => void;
}

export function DeleteConfirmModal({ nodeId, label, onClose }: DeleteConfirmModalProps) {
  const { api, removeNode } = useCanvasStore();

  const handleDelete = () => {
    removeNode(nodeId);
    fetch(`${api}/api/nodes/${nodeId}`, { method: "DELETE" }).catch(() => {});
    onClose();
  };

  return (
    <div
      className="nodrag nowheel"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "20px 24px",
          width: 240,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon path={mdiDeleteOutline} size={0.8} color="var(--red)" />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Delete nanobot</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
          This will permanently delete <strong style={{ color: "var(--text)" }}>{label}</strong> and
          its container. This action cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "6px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            style={{
              background: "var(--red)",
              color: "var(--text)",
              border: "none",
              borderRadius: 4,
              padding: "6px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
