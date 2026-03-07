"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@mdi/react";
import { mdiClose, mdiCog, mdiRobot, mdiFormatListBulleted, mdiDeleteSweepOutline } from "@mdi/js";
import { useAsyncForm } from "@/hooks/useAsyncForm";
import { useEventLogStore, type EventLogEntry } from "@/store/eventLogStore";
import { useAreaStore } from "@/store/areaStore";

type SettingsTab = "config" | "templates" | "events";
type TemplateKey = "SOUL.md" | "AGENTS.md" | "USER.md" | "HEARTBEAT.md";

const TEMPLATE_FILES: { key: TemplateKey; label: string }[] = [
  { key: "SOUL.md", label: "Soul" },
  { key: "AGENTS.md", label: "Agents" },
  { key: "USER.md", label: "User" },
  { key: "HEARTBEAT.md", label: "Heartbeat" },
];

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

function EventListEmbedded({
  api,
  onFocusNode,
}: {
  api: string;
  onFocusNode?: (nodeId: string) => void;
}) {
  const events = useEventLogStore((s) => s.events);
  const clearEvents = useEventLogStore((s) => s.clearEvents);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 16px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => clearEvents(api)}
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
      </div>
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", fontSize: 11 }}>
        {events.length === 0 ? (
          <div style={{ padding: 12, color: "var(--text-muted)", textAlign: "center", fontSize: 11 }}>
            No events yet
          </div>
        ) : (
          events.map((entry) => (
            <div
              key={entry.id}
              onClick={() => entry.node_id && onFocusNode?.(entry.node_id)}
              style={{
                display: "grid",
                gridTemplateColumns: "54px 80px 60px 1fr",
                alignItems: "center",
                gap: 6,
                padding: "3px 12px",
                cursor: entry.node_id ? "pointer" : "default",
                borderBottom: "1px solid var(--overlay-subtle)",
              }}
              onMouseOver={(e) => {
                if (entry.node_id) (e.currentTarget as HTMLDivElement).style.background = "var(--overlay-subtle)";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--text-muted)" }}>
                {formatTime(entry.created_at)}
              </span>
              <span
                style={{
                  color: "var(--text)",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={entry.node_name || undefined}
              >
                {entry.node_name || "\u2014"}
              </span>
              <span
                style={{
                  fontSize: 9,
                  background: `${EVENT_TYPE_COLORS[entry.event_type] || "var(--text-muted)"}22`,
                  color: EVENT_TYPE_COLORS[entry.event_type] || "var(--text-muted)",
                  borderRadius: 3,
                  padding: "1px 6px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {EVENT_TYPE_LABELS[entry.event_type] || entry.event_type}
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
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
    </>
  );
}

export function DefaultConfigPanel({
  api,
  onClose,
  isMobile,
  onFocusNode,
}: {
  api: string;
  onClose: () => void;
  isMobile?: boolean;
  onFocusNode?: (nodeId: string) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("config");
  const eventLogEnabled = useEventLogStore((s) => s.enabled);
  const setEventLogEnabled = useEventLogStore((s) => s.setEnabled);
  const activeAreaId = useAreaStore((s) => s.activeAreaId);
  const areaParam = activeAreaId ? `?area_id=${activeAreaId}` : "";

  // ─── Config form ───
  const configForm = useAsyncForm({
    loadFn: useCallback(async () => {
      const res = await fetch(`${api}/api/settings/default-config${areaParam}`);
      const data = await res.json();
      return JSON.stringify(data.config || {}, null, 2);
    }, [api, areaParam]),
    saveFn: useCallback(async (value: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        console.warn('Invalid JSON in default config editor:', error);
        throw new Error("Invalid JSON");
      }
      const res = await fetch(`${api}/api/settings/default-config${areaParam}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: parsed }),
      });
      if (!res.ok) throw new Error("Save failed");
    }, [api, areaParam]),
  });

  // ─── Templates state ───
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [activeTemplate, setActiveTemplate] = useState<TemplateKey>("SOUL.md");
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesSaving, setTemplatesSaving] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatesSuccess, setTemplatesSuccess] = useState(false);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch(`${api}/api/settings/default-templates${areaParam}`);
      const data = await res.json();
      setTemplates(data.templates || {});
      setTemplatesError(null);
    } catch (error) {
      console.error('Failed to load default templates:', error);
      setTemplatesError("Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }, [api, areaParam]);

  useEffect(() => {
    configForm.load();
    loadTemplates();
  }, [configForm.load, loadTemplates]);

  const saveTemplates = async () => {
    setTemplatesSaving(true);
    setTemplatesError(null);
    setTemplatesSuccess(false);
    try {
      const res = await fetch(`${api}/api/settings/default-templates${areaParam}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      if (!res.ok) throw new Error("Save failed");
      setTemplatesSuccess(true);
      setTimeout(() => setTemplatesSuccess(false), 2000);
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setTemplatesSaving(false);
    }
  };

  const btnBase: React.CSSProperties = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "6px 12px",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    gap: 4,
    borderBottom: "2px solid transparent",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: isMobile ? "100%" : 420,
        height: "100vh",
        background: "var(--bg-card)",
        borderLeft: isMobile ? "none" : "1px solid var(--border)",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card-header)",
        }}
      >
        <span style={{ fontWeight: 600 }}>Settings</span>
        <button
          onClick={onClose}
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
        >
          <Icon path={mdiClose} size={0.7} />
        </button>
      </div>

      {/* Top tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card-header)",
        }}
      >
        <button
          onClick={() => setTab("config")}
          style={{
            ...btnBase,
            color: tab === "config" ? "var(--text)" : "var(--text-muted)",
            borderBottomColor: tab === "config" ? "var(--tab-active)" : "transparent",
          }}
        >
          <Icon path={mdiCog} size={0.55} /> Config
        </button>
        <button
          onClick={() => setTab("templates")}
          style={{
            ...btnBase,
            color: tab === "templates" ? "var(--text)" : "var(--text-muted)",
            borderBottomColor: tab === "templates" ? "var(--tab-active)" : "transparent",
          }}
        >
          <Icon path={mdiRobot} size={0.55} /> Agent Templates
        </button>
        {!isMobile && (
          <button
            onClick={() => setTab("events")}
            style={{
              ...btnBase,
              color: tab === "events" ? "var(--text)" : "var(--text-muted)",
              borderBottomColor: tab === "events" ? "var(--tab-active)" : "transparent",
            }}
          >
            <Icon path={mdiFormatListBulleted} size={0.55} /> Events
          </button>
        )}
      </div>

      {/* Config Tab */}
      <div style={{ flex: 1, padding: 16, flexDirection: "column", gap: 8, overflow: "hidden", display: tab === "config" ? "flex" : "none" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          JSON config applied to every new nanobot (provider, model, etc).
        </div>
        {configForm.error && <div style={{ color: "var(--red)", fontSize: 11 }}>{configForm.error}</div>}
        {configForm.success && <div style={{ color: "var(--green)", fontSize: 11 }}>Saved</div>}
        {configForm.loading ? (
          <div style={{ color: "var(--text-muted)" }}>Loading...</div>
        ) : (
          <>
            <textarea
              value={configForm.value}
              onChange={(e) => configForm.setValue(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                background: "var(--input-bg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: 10,
                color: "var(--text)",
                fontSize: 11,
                fontFamily: "monospace",
                resize: "none",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={configForm.save}
                disabled={configForm.saving}
                style={{
                  background: "var(--accent)",
                  color: "var(--text)",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 16px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {configForm.saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={configForm.load}
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "6px 16px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>
          </>
        )}
      </div>

      {/* Agent Templates Tab */}
      <div style={{ flex: 1, flexDirection: "column", overflow: "hidden", display: tab === "templates" ? "flex" : "none" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 16px" }}>
          Default .md files written to every new nanobot's workspace.
        </div>

        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-card-header)",
          }}
        >
          {TEMPLATE_FILES.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTemplate(t.key)}
              style={{
                flex: 1,
                padding: "4px 0",
                background: "transparent",
                border: "none",
                borderBottom:
                  activeTemplate === t.key
                    ? "2px solid var(--tab-active)"
                    : "2px solid transparent",
                color: activeTemplate === t.key ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: activeTemplate === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {templatesError && <div style={{ color: "var(--red)", fontSize: 11, padding: "4px 16px" }}>{templatesError}</div>}
        {templatesSuccess && <div style={{ color: "var(--green)", fontSize: 11, padding: "4px 16px" }}>Saved</div>}

        {templatesLoading ? (
          <div style={{ color: "var(--text-muted)", padding: 16 }}>Loading...</div>
        ) : (
          <div style={{ flex: 1, padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
            <textarea
              value={templates[activeTemplate] || ""}
              onChange={(e) => setTemplates((prev) => ({ ...prev, [activeTemplate]: e.target.value }))}
              spellCheck={false}
              placeholder={`Default content for ${activeTemplate}...\nLeave empty to use built-in defaults.`}
              style={{
                flex: 1,
                background: "var(--input-bg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: 10,
                color: "var(--text)",
                fontSize: 11,
                fontFamily: "monospace",
                resize: "none",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={saveTemplates}
                disabled={templatesSaving}
                style={{
                  background: "var(--accent)",
                  color: "var(--text)",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 16px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {templatesSaving ? "Saving..." : "Save All"}
              </button>
              <button
                onClick={loadTemplates}
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "6px 16px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Events Tab */}
      <div style={{
        flex: 1,
        flexDirection: "column",
        overflow: "hidden",
        display: tab === "events" ? "flex" : "none",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
              Enable Event Log
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              Polls server for events every 3s when enabled
            </div>
          </div>
          <label style={{
            position: "relative",
            display: "inline-block",
            width: 36,
            height: 20,
            flexShrink: 0,
          }}>
            <input
              type="checkbox"
              checked={eventLogEnabled}
              onChange={(e) => setEventLogEnabled(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: "absolute",
              cursor: "pointer",
              top: 0, left: 0, right: 0, bottom: 0,
              background: eventLogEnabled ? "var(--accent)" : "var(--border)",
              borderRadius: 10,
              transition: "background 0.2s",
            }}>
              <span style={{
                position: "absolute",
                height: 16, width: 16,
                left: eventLogEnabled ? 18 : 2,
                bottom: 2,
                background: "var(--text)",
                borderRadius: "50%",
                transition: "left 0.2s",
              }} />
            </span>
          </label>
        </div>

        {eventLogEnabled ? (
          <EventListEmbedded api={api} onFocusNode={onFocusNode} />
        ) : (
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: 11,
            padding: 16,
            textAlign: "center",
          }}>
            Event logging is disabled. Enable it to see real-time events.
          </div>
        )}
      </div>
    </div>
  );
}
