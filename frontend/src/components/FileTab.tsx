"use client";

import { useCallback, useEffect, useState } from "react";

export function FileTab({
  nodeId,
  api,
  filename,
  visible,
}: {
  nodeId: string;
  api: string;
  filename: string;
  visible?: boolean;
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/files/${filename}`);
      const data = await res.json();
      setContent(data.content || "");
      setError(null);
    } catch {
      setError("Failed to load file");
    } finally {
      setLoading(false);
    }
  }, [api, nodeId, filename]);

  // Reload from container whenever this tab becomes visible
  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/files/${filename}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return <div style={{ color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      {error && <div style={{ color: "var(--red)", fontSize: 11 }}>{error}</div>}
      {success && <div style={{ color: "var(--green)", fontSize: 11 }}>Saved</div>}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
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
          onClick={save}
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
          {saving ? "Saving..." : "Save"}
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
