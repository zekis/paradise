"use client";

import { useCallback, useEffect } from "react";
import { TextEditor } from "./TextEditor";
import { useAsyncForm } from "@/hooks/useAsyncForm";

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
  const loadFn = useCallback(async () => {
    const res = await fetch(`${api}/api/nodes/${nodeId}/files/${filename}`);
    const data = await res.json();
    return data.content || "";
  }, [api, nodeId, filename]);

  const saveFn = useCallback(async (value: string) => {
    const res = await fetch(`${api}/api/nodes/${nodeId}/files/${filename}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: value }),
    });
    if (!res.ok) throw new Error("Save failed");
  }, [api, nodeId, filename]);

  const { value, setValue, loading, saving, error, success, load, save } = useAsyncForm({ loadFn, saveFn });

  useEffect(() => { if (visible) load(); }, [visible, load]);

  if (loading) return <div style={{ color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <TextEditor
      value={value}
      onChange={setValue}
      error={error}
      success={success}
      saving={saving}
      onSave={save}
      onReload={load}
    />
  );
}
