"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@mdi/react";
import { mdiRefresh } from "@mdi/js";
import { TextEditor } from "./TextEditor";
import { useAsyncForm } from "@/hooks/useAsyncForm";
import { useCanvasStore } from "@/store/canvasStore";

interface FileBrowserTabProps {
  nodeId: string;
  api: string;
}

export function FileBrowserTab({ nodeId, api }: FileBrowserTabProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [hasConfig, setHasConfig] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);

  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/workspace`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        setHasConfig(data.has_config || false);
      }
    } catch (error) {
      console.error(`Failed to fetch workspace files for node ${nodeId}:`, error);
    }
    setLoadingFiles(false);
  }, [api, nodeId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Build the full file list: config.json first (if exists), then workspace files sorted
  const allFiles = [
    ...(hasConfig ? ["config.json"] : []),
    ...files,
  ];

  // Auto-select first file when list loads
  useEffect(() => {
    if (!selectedFile && allFiles.length > 0) {
      setSelectedFile(allFiles[0]);
    }
  }, [allFiles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadingFiles) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 16, textAlign: "center" }}>
        Loading files...
      </div>
    );
  }

  if (allFiles.length === 0) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 16, textAlign: "center" }}>
        No files found. Run genesis to create workspace files.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* File tree (left pane) */}
      <div
        style={{
          width: 130,
          minWidth: 130,
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 8px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Files
          </span>
          <button
            onClick={fetchFiles}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 0,
              lineHeight: 0,
              display: "flex",
              alignItems: "center",
            }}
            title="Refresh file list"
          >
            <Icon path={mdiRefresh} size={0.45} />
          </button>
        </div>
        {allFiles.map((file) => (
          <button
            key={file}
            onClick={() => setSelectedFile(file)}
            style={{
              display: "block",
              width: "100%",
              padding: "5px 8px",
              background: selectedFile === file ? "rgba(99, 102, 241, 0.15)" : "transparent",
              border: "none",
              borderLeft: selectedFile === file ? "2px solid var(--accent, #6366f1)" : "2px solid transparent",
              color: selectedFile === file ? "var(--text)" : "var(--text-muted)",
              fontSize: 10,
              fontFamily: "monospace",
              textAlign: "left",
              cursor: "pointer",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={file}
          >
            {file}
          </button>
        ))}
      </div>

      {/* Editor (right pane) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selectedFile ? (
          <FileEditor
            key={`${nodeId}:${selectedFile}`}
            nodeId={nodeId}
            api={api}
            filename={selectedFile}
            isConfig={selectedFile === "config.json"}
          />
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 16, textAlign: "center" }}>
            Select a file to view
          </div>
        )}
      </div>
    </div>
  );
}

function FileEditor({
  nodeId,
  api,
  filename,
  isConfig,
}: {
  nodeId: string;
  api: string;
  filename: string;
  isConfig: boolean;
}) {
  const loadFn = useCallback(async () => {
    if (isConfig) {
      const res = await fetch(`${api}/api/nodes/${nodeId}/config`);
      const data = await res.json();
      return JSON.stringify(data.config || {}, null, 2);
    }
    const res = await fetch(`${api}/api/nodes/${nodeId}/workspace/${encodeURIComponent(filename)}`);
    const data = await res.json();
    return data.content || "";
  }, [api, nodeId, filename, isConfig]);

  const saveFn = useCallback(
    async (value: string) => {
      if (isConfig) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(value);
        } catch (error) {
          console.warn('Invalid JSON in file editor:', error);
          throw new Error("Invalid JSON");
        }
        const res = await fetch(`${api}/api/nodes/${nodeId}/config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: parsed }),
        });
        if (!res.ok) throw new Error("Save failed");
        // Tell the nanobot to reload its agent with the new config
        const wsUrl = api.replace(/^http/, "ws") + `/api/nodes/${nodeId}/chat`;
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "reload" }));
          setTimeout(() => ws.close(), 2000);
        };
        return;
      }
      const res = await fetch(
        `${api}/api/nodes/${nodeId}/workspace/${encodeURIComponent(filename)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: value }),
        },
      );
      if (!res.ok) throw new Error("Save failed");
    },
    [api, nodeId, filename, isConfig],
  );

  const { value, setValue, loading, saving, error, success, load, save } = useAsyncForm({
    loadFn,
    saveFn,
  });

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 16, textAlign: "center" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Filename header */}
      <div
        style={{
          padding: "4px 10px",
          borderBottom: "1px solid var(--border)",
          fontSize: 10,
          fontFamily: "monospace",
          color: "var(--text-muted)",
          background: "rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {filename}
        </span>
        {isConfig && (
          <span style={{ fontSize: 9, color: "var(--yellow)", opacity: 0.8 }}>
            save reloads agent
          </span>
        )}
      </div>
      {/* Editor */}
      <div style={{ flex: 1, padding: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <TextEditor
          value={value}
          onChange={setValue}
          error={error}
          success={success}
          saving={saving}
          onSave={save}
          onReload={load}
          saveLabel={isConfig ? "Save & Reload" : "Save"}
        />
      </div>
    </div>
  );
}
