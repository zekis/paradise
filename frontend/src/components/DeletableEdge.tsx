"use client";

import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { mdiChat } from "@mdi/js";
import { useCanvasStore } from "@/store/canvasStore";
import { API_URL as API } from "@/lib/api";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const removeEdge = useCanvasStore((s) => s.removeEdge);
  const updateEdgeChatEnabled = useCanvasStore((s) => s.updateEdgeChatEnabled);

  const chatEnabled = (data as Record<string, unknown> | undefined)?.chatEnabled === true;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const edgeStyle = chatEnabled
    ? { ...style, stroke: "var(--accent)", strokeWidth: 2 }
    : style;

  const toggleChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !chatEnabled;
    updateEdgeChatEnabled(id, newState);
    fetch(`${API}/api/edges/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_enabled: newState }),
    }).catch((error) => {
      console.error(`Failed to toggle chat on edge ${id}:`, error);
      updateEdgeChatEnabled(id, !newState);
    });
  };

  const showButtons = hovered || chatEnabled;

  return (
    <>
      <BaseEdge path={edgePath} style={edgeStyle} markerEnd={markerEnd} interactionWidth={0} />
      {/* Hover detection path rendered after BaseEdge so it sits on top in SVG z-order */}
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={20}
        style={{ pointerEvents: "all" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {showButtons && (
        <EdgeLabelRenderer>
          {/* Chat toggle button */}
          <button
            onClick={toggleChat}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX - 14}px, ${labelY}px)`,
              pointerEvents: "all",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: chatEnabled ? "var(--accent)" : "var(--bg-card)",
              border: `1.5px solid ${chatEnabled ? "var(--accent)" : "var(--border)"}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              boxShadow: "0 2px 6px var(--shadow-sm)",
              opacity: chatEnabled ? 1 : (hovered ? 0.9 : 0),
              transition: "opacity 0.15s",
            }}
            title={chatEnabled ? "Disable peer chat" : "Enable peer chat"}
          >
            <svg width={12} height={12} viewBox="0 0 24 24">
              <path d={mdiChat} fill={chatEnabled ? "var(--text)" : "var(--text-muted)"} />
            </svg>
          </button>
          {/* Delete button */}
          {hovered && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeEdge(id);
              }}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX + 14}px, ${labelY}px)`,
                pointerEvents: "all",
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "var(--red)",
                color: "var(--text)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                lineHeight: 1,
                padding: 0,
                boxShadow: "0 2px 6px var(--shadow-sm)",
              }}
              title="Delete connection"
            >
              ×
            </button>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}
