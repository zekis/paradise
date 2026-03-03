"use client";

import { useCallback, useEffect } from "react";
import { TextEditor } from "./TextEditor";
import { useAsyncForm } from "@/hooks/useAsyncForm";

export function ConfigTab({ nodeId, api }: { nodeId: string; api: string }) {
  const loadFn = useCallback(async () => {
    const res = await fetch(`${api}/api/nodes/${nodeId}/config`);
    const data = await res.json();
    return JSON.stringify(data.config || {}, null, 2);
  }, [api, nodeId]);

  const saveFn = useCallback(async (value: string) => {
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch (error) { console.warn('Invalid JSON in config editor:', error); throw new Error("Invalid JSON"); }
    const res = await fetch(`${api}/api/nodes/${nodeId}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: parsed }),
    });
    if (!res.ok) throw new Error("Save failed");
    // Tell the nanobot to reload its agent with the new config
    const wsUrl = api.replace(/^http/, "ws") + `/api/nodes/${nodeId}/chat`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { ws.send(JSON.stringify({ type: "reload" })); setTimeout(() => ws.close(), 2000); };
  }, [api, nodeId]);

  const { value, setValue, loading, saving, error, load, save } = useAsyncForm({ loadFn, saveFn });

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <TextEditor
      value={value}
      onChange={setValue}
      error={error}
      saving={saving}
      onSave={save}
      onReload={load}
      saveLabel="Save & Reload"
    />
  );
}
