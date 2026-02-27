"use client";

import { useCallback, useEffect, useState } from "react";

export function ConfigTab({ nodeId, api }: { nodeId: string; api: string }) {
  const [config, setConfig] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/config`);
      const data = await res.json();
      setConfig(JSON.stringify(data.config || {}, null, 2));
      setError(null);
    } catch {
      setError("Failed to load config");
    } finally {
      setLoading(false);
    }
  }, [api, nodeId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (reload = false) => {
    setSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(config);
      const res = await fetch(`${api}/api/nodes/${nodeId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: parsed }),
      });
      if (!res.ok) throw new Error("Save failed");

      // Tell the nanobot to reload its agent with the new config
      if (reload) {
        const wsUrl = api.replace(/^http/, "ws") + `/api/nodes/${nodeId}/chat`;
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "reload" }));
          setTimeout(() => ws.close(), 2000);
        };
      }
    } catch (err: any) {
      setError(err.message || "Invalid JSON");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      {error && (
        <div style={{ color: "var(--red)", fontSize: 11 }}>{error}</div>
      )}
      <textarea
        value={config}
        onChange={(e) => setConfig(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          background: "rgba(0,0,0,0.3)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: 8,
          color: "var(--text)",
          fontSize: 11,
          fontFamily: "monospace",
          resize: "none",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => save(true)}
          disabled={saving}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            padding: "4px 12px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {saving ? "Saving..." : "Save & Reload"}
        </button>
        <button
          onClick={load}
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "4px 12px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
