"use client";

import { useState } from "react";
import Icon from "@mdi/react";
import { mdiClose } from "@mdi/js";
import type { Area } from "@/store/areaStore";

interface AreaDeleteModalProps {
  area: Area;
  otherAreas: Area[];
  onConfirm: (moveToAreaId: string) => void;
  onClose: () => void;
}

export function AreaDeleteModal({ area, otherAreas, onConfirm, onClose }: AreaDeleteModalProps) {
  const [selectedId, setSelectedId] = useState(otherAreas[0]?.id || "");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 20,
          minWidth: 320,
          maxWidth: 400,
          boxShadow: "0 8px 32px var(--shadow-md)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: "var(--text)" }}>
            Delete &ldquo;{area.name}&rdquo;
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
          >
            <Icon path={mdiClose} size={0.7} color="var(--text-muted)" />
          </button>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          {area.node_count > 0
            ? `This area has ${area.node_count} node${area.node_count === 1 ? "" : "s"}. Choose where to move them:`
            : "This area is empty. It will be deleted."}
        </p>

        {area.node_count > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {otherAreas.map((a) => (
              <label
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: selectedId === a.id ? "var(--overlay-light)" : "transparent",
                  fontSize: 12,
                  color: "var(--text)",
                }}
              >
                <input
                  type="radio"
                  name="move-to-area"
                  value={a.id}
                  checked={selectedId === a.id}
                  onChange={() => setSelectedId(a.id)}
                  style={{ accentColor: "var(--accent)" }}
                />
                {a.name}
              </label>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              background: "var(--overlay-light)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedId)}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              background: "var(--red)",
              border: "none",
              borderRadius: 4,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Delete Area
          </button>
        </div>
      </div>
    </div>
  );
}
