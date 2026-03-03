"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@mdi/react";
import { mdiClose, mdiCog, mdiRobot } from "@mdi/js";
import { useAsyncForm } from "@/hooks/useAsyncForm";

type SettingsTab = "config" | "templates";
type TemplateKey = "SOUL.md" | "AGENTS.md" | "USER.md" | "HEARTBEAT.md";

const TEMPLATE_FILES: { key: TemplateKey; label: string }[] = [
  { key: "SOUL.md", label: "Soul" },
  { key: "AGENTS.md", label: "Agents" },
  { key: "USER.md", label: "User" },
  { key: "HEARTBEAT.md", label: "Heartbeat" },
];

export function DefaultConfigPanel({
  api,
  onClose,
}: {
  api: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("config");

  // ─── Config form ───
  const configForm = useAsyncForm({
    loadFn: useCallback(async () => {
      const res = await fetch(`${api}/api/settings/default-config`);
      const data = await res.json();
      return JSON.stringify(data.config || {}, null, 2);
    }, [api]),
    saveFn: useCallback(async (value: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        console.warn('Invalid JSON in default config editor:', error);
        throw new Error("Invalid JSON");
      }
      const res = await fetch(`${api}/api/settings/default-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: parsed }),
      });
      if (!res.ok) throw new Error("Save failed");
    }, [api]),
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
      const res = await fetch(`${api}/api/settings/default-templates`);
      const data = await res.json();
      setTemplates(data.templates || {});
      setTemplatesError(null);
    } catch (error) {
      console.error('Failed to load default templates:', error);
      setTemplatesError("Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }, [api]);

  useEffect(() => {
    configForm.load();
    loadTemplates();
  }, [configForm.load, loadTemplates]);

  const saveTemplates = async () => {
    setTemplatesSaving(true);
    setTemplatesError(null);
    setTemplatesSuccess(false);
    try {
      const res = await fetch(`${api}/api/settings/default-templates`, {
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
        width: 420,
        height: "100vh",
        background: "var(--bg-card)",
        borderLeft: "1px solid var(--border)",
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
    </div>
  );
}
