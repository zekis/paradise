"use client";

import { useState } from "react";
import Icon from "@mdi/react";
import { mdiRobot, mdiPlus } from "@mdi/js";

const EXAMPLES = [
  "Proxmox server manager",
  "Weather dashboard",
  "Code reviewer",
  "Home automation controller",
  "DevOps monitoring agent",
  "Research assistant",
];

interface GenesisModalProps {
  onClose: () => void;
  onCreate: (genesisPrompt: string | null) => void;
}

export function GenesisModal({ onClose, onCreate }: GenesisModalProps) {
  const [prompt, setPrompt] = useState("");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "24px 28px",
          width: 400,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon path={mdiRobot} size={1} color="var(--accent)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Genesis</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              What should this agent be?
            </div>
          </div>
        </div>

        {/* Input */}
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && prompt.trim()) onCreate(prompt.trim());
          }}
          placeholder="e.g., Proxmox server manager..."
          autoFocus
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "10px 12px",
            color: "var(--text)",
            fontSize: 14,
            outline: "none",
            width: "100%",
          }}
        />

        {/* Example chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "4px 10px",
                fontSize: 11,
                color: "var(--text-muted)",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.12)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
              }
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={() => onCreate(null)}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Skip
          </button>
          <button
            onClick={() => onCreate(prompt.trim() || null)}
            disabled={!prompt.trim()}
            style={{
              background: prompt.trim() ? "var(--accent)" : "rgba(255,255,255,0.1)",
              color: prompt.trim() ? "#fff" : "var(--text-muted)",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              cursor: prompt.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon path={mdiPlus} size={0.6} />
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
