"use client";

import { useState } from "react";
import Icon from "@mdi/react";
import { mdiRobot, mdiPlus } from "@mdi/js";
import { resolveMdiIcon } from "@/lib/mdiIcons";
import type { Recommendation } from "@/types";

const EXAMPLES = [
  "Proxmox server manager",
  "Weather dashboard",
  "Code reviewer",
  "Home automation controller",
  "DevOps monitoring agent",
  "Research assistant",
];

export interface GenesisResult {
  genesisPrompt: string | null;
  recommendation?: Recommendation;
}

interface GenesisModalProps {
  onClose: () => void;
  onCreate: (result: GenesisResult) => void;
  parentContext?: {
    nodeId: string;
    nodeName: string;
    recommendations: Recommendation[];
  };
}

export function GenesisModal({ onClose, onCreate, parentContext }: GenesisModalProps) {
  const [prompt, setPrompt] = useState("");

  const hasRecs = parentContext && parentContext.recommendations.length > 0;

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
              {parentContext
                ? <>Creating child of <strong style={{ color: "var(--text)" }}>{parentContext.nodeName}</strong></>
                : "What should this agent be?"}
            </div>
          </div>
        </div>

        {/* Recommendations (child mode) */}
        {hasRecs && (
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Recommended
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
              {parentContext.recommendations.map((rec) => {
                const iconPath = rec.icon ? resolveMdiIcon(rec.icon) : null;
                return (
                  <button
                    key={rec.name}
                    onClick={() => onCreate({ genesisPrompt: rec.genesis_prompt, recommendation: rec })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px dashed var(--border)",
                      borderRadius: 6,
                      cursor: "pointer",
                      textAlign: "left",
                      color: "var(--text)",
                      fontSize: 12,
                      width: "100%",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.15)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  >
                    {iconPath ? (
                      <Icon path={iconPath} size={0.55} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    ) : rec.emoji ? (
                      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{rec.emoji}</span>
                    ) : (
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-muted)", flexShrink: 0, opacity: 0.4 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.name}
                      </div>
                      {rec.description && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {rec.description}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider between recs and custom input */}
        {hasRecs && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
            or describe a custom agent
          </div>
        )}

        {/* Input */}
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && prompt.trim()) onCreate({ genesisPrompt: prompt.trim() });
          }}
          placeholder={parentContext ? "e.g., Custom child agent..." : "e.g., Proxmox server manager..."}
          autoFocus={!hasRecs}
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

        {/* Example chips (root mode only) */}
        {!parentContext && (
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
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={() => onCreate({ genesisPrompt: null })}
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
            onClick={() => onCreate({ genesisPrompt: prompt.trim() || null })}
            disabled={!prompt.trim()}
            style={{
              background: prompt.trim() ? "var(--accent)" : "rgba(255,255,255,0.1)",
              color: prompt.trim() ? "var(--text)" : "var(--text-muted)",
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
