"use client";

import Icon from "@mdi/react";
import { mdiCog, mdiPlus } from "@mdi/js";

interface CanvasToolbarProps {
  showSettings: boolean;
  onToggleSettings: () => void;
  onAddBot: () => void;
}

export function CanvasToolbar({ showSettings, onToggleSettings, onAddBot }: CanvasToolbarProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        display: "flex",
        gap: 10,
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <button
        onClick={onToggleSettings}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: showSettings ? "var(--accent)" : "var(--bg-card)",
          color: showSettings ? "var(--text)" : "var(--text-muted)",
          border: "1px solid var(--border)",
          fontSize: 18,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s, color 0.2s",
        }}
        title="Default Config"
      >
        <Icon path={mdiCog} size={0.9} />
      </button>
      <button
        onClick={onAddBot}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "var(--accent)",
          color: "var(--text)",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        title="Add Nanobot"
      >
        <Icon path={mdiPlus} size={1} />
      </button>
    </div>
  );
}
