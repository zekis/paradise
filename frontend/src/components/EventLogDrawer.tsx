"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@mdi/react";
import { mdiChevronUp, mdiChevronDown, mdiDeleteSweepOutline } from "@mdi/js";
import { useEventLogStore, type EventLogEntry } from "@/store/eventLogStore";
import { useCanvasStore } from "@/store/canvasStore";

const DRAWER_HEIGHT = 220;
const BAR_HEIGHT = 32;

const EVENT_TYPE_COLORS: Record<string, string> = {
  node_created: "var(--green)",
  node_cloned: "var(--green)",
  node_deleted: "var(--red)",
  node_renamed: "var(--accent)",
  container_restart: "var(--yellow)",
  container_rebuild: "var(--yellow)",
  agent_status: "var(--yellow)",
  identity_update: "var(--accent)",
  chat_response: "var(--text-muted)",
  chat_tool_call: "var(--text-muted)",
  chat_error: "var(--red)",
  edge_created: "var(--text-muted)",
  edge_deleted: "var(--text-muted)",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  node_created: "created",
  node_cloned: "cloned",
  node_deleted: "deleted",
  node_renamed: "renamed",
  container_restart: "restart",
  container_rebuild: "rebuild",
  agent_status: "status",
  identity_update: "identity",
  chat_response: "response",
  chat_tool_call: "tool_call",
  chat_error: "error",
  edge_created: "edge+",
  edge_deleted: "edge-",
};

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

interface EventLogDrawerProps {
  drawerOpen: boolean;
  onFocusNode: (nodeId: string) => void;
}

export function EventLogDrawer({ drawerOpen, onFocusNode }: EventLogDrawerProps) {
  const events = useEventLogStore((s) => s.events);
  const api = useCanvasStore((s) => s.api);
  const clearEvents = useEventLogStore((s) => s.clearEvents);

  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(events.length);

  // Auto-peek on new events
  useEffect(() => {
    if (events.length > prevLengthRef.current && !expanded && !pinned) {
      setExpanded(true);
      if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
      peekTimeoutRef.current = setTimeout(() => setExpanded(false), 3000);
    }
    prevLengthRef.current = events.length;
  }, [events.length, expanded, pinned]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length, expanded]);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
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
        // Unpinning — collapse after delay
        leaveTimeoutRef.current = setTimeout(() => setExpanded(false), 600);
      }
      return !p;
    });
    setExpanded(true);
  }, []);

  const handleClear = useCallback(() => {
    if (api) clearEvents(api);
  }, [api, clearEvents]);

  const handleEventClick = useCallback((entry: EventLogEntry) => {
    if (entry.node_id) {
      onFocusNode(entry.node_id);
    }
  }, [onFocusNode]);

  const translateY = expanded ? 0 : DRAWER_HEIGHT - BAR_HEIGHT;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: drawerOpen ? 420 : 0,
        height: DRAWER_HEIGHT,
        transform: `translateY(${translateY}px)`,
        transition: "transform 0.25s ease, right 0.15s ease",
        background: "var(--bg-card)",
        borderTop: "1px solid var(--border)",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        boxShadow: expanded ? "0 -4px 16px rgba(0, 0, 0, 0.3)" : undefined,
      }}
    >
      {/* Header bar */}
      <div
        style={{
          height: BAR_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          background: "var(--bg-card-header)",
          borderBottom: expanded ? "1px solid var(--border)" : undefined,
          flexShrink: 0,
          cursor: "pointer",
          opacity: expanded ? 1 : 0.5,
          transition: "opacity 0.15s",
        }}
        onClick={handleTogglePin}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
            Event Log
          </span>
          {events.length > 0 && (
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
              {events.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {expanded && (
            <button
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "0 4px",
                lineHeight: 0,
                display: "flex",
                alignItems: "center",
              }}
              title="Clear events"
            >
              <Icon path={mdiDeleteSweepOutline} size={0.55} />
            </button>
          )}
          <Icon
            path={expanded ? mdiChevronDown : mdiChevronUp}
            size={0.55}
            color="var(--text-muted)"
          />
        </div>
      </div>

      {/* Event list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          fontSize: 11,
        }}
      >
        {events.length === 0 ? (
          <div style={{ padding: 12, color: "var(--text-muted)", textAlign: "center", fontSize: 11 }}>
            No events yet
          </div>
        ) : (
          events.map((entry) => (
            <div
              key={entry.id}
              onClick={() => handleEventClick(entry)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "3px 12px",
                cursor: entry.node_id ? "pointer" : "default",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
              onMouseOver={(e) => {
                if (entry.node_id) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              {/* Timestamp */}
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--text-muted)", flexShrink: 0, width: 58 }}>
                {formatTime(entry.created_at)}
              </span>

              {/* Node name */}
              <span
                style={{
                  color: "var(--text)",
                  fontWeight: 500,
                  maxWidth: 100,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                title={entry.node_name || undefined}
              >
                {entry.node_name || "—"}
              </span>

              {/* Type badge */}
              <span
                style={{
                  fontSize: 9,
                  background: `${EVENT_TYPE_COLORS[entry.event_type] || "var(--text-muted)"}22`,
                  color: EVENT_TYPE_COLORS[entry.event_type] || "var(--text-muted)",
                  borderRadius: 3,
                  padding: "1px 6px",
                  fontWeight: 600,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {EVENT_TYPE_LABELS[entry.event_type] || entry.event_type}
              </span>

              {/* Summary */}
              <span
                style={{
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
                title={entry.summary || undefined}
              >
                {entry.summary || ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
