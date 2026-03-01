"use client";

import { useEffect, useRef, useState } from "react";

const PARADISE_BRIDGE = (nodeId: string, api: string) => `
<style>html,body{margin:0;padding:0;overflow-y:auto;overflow-x:hidden;background:#0a0a0a;color:#e0e0e0;font-family:system-ui,sans-serif;font-size:12px;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:#0a0a0a;}::-webkit-scrollbar-thumb{background:#333;border-radius:3px;}::-webkit-scrollbar-thumb:hover{background:#555;}*{scrollbar-width:thin;scrollbar-color:#333 #0a0a0a;}</style>
<script>
const PARADISE = {
  nodeId: ${JSON.stringify(nodeId)},
  api: ${JSON.stringify(api)},

  async exec(content) {
    const res = await fetch(this.api + "/api/nodes/" + this.nodeId + "/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error("exec failed: " + res.status);
    return (await res.json()).response;
  },

  async readFile(filename) {
    const res = await fetch(this.api + "/api/nodes/" + this.nodeId + "/files/" + encodeURIComponent(filename));
    if (!res.ok) throw new Error("readFile failed: " + res.status);
    return (await res.json()).content;
  },

  async writeFile(filename, content) {
    const res = await fetch(this.api + "/api/nodes/" + this.nodeId + "/files/" + encodeURIComponent(filename), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error("writeFile failed: " + res.status);
  },

  async run(command) {
    const res = await fetch(this.api + "/api/nodes/" + this.nodeId + "/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command })
    });
    if (!res.ok) throw new Error("run failed: " + res.status);
    const data = await res.json();
    if (data.exit_code !== 0) throw new Error("Command failed: " + data.output);
    return data.output;
  },

  async rename(name) {
    const res = await fetch(this.api + "/api/nodes/" + this.nodeId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error("rename failed: " + res.status);
    window.parent.postMessage({ type: "paradise:rename", nodeId: this.nodeId, name }, "*");
  },

  async setStatus(status, message) {
    const res = await fetch(this.api + "/api/nodes/" + this.nodeId + "/agent-status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, message: message || "" })
    });
    if (!res.ok) throw new Error("setStatus failed: " + res.status);
    window.parent.postMessage({ type: "paradise:status", nodeId: this.nodeId, status, message: message || "" }, "*");
  },

  async getNetwork() {
    const res = await fetch(this.api + "/api/nodes/" + this.nodeId + "/network");
    if (!res.ok) throw new Error("getNetwork failed: " + res.status);
    return await res.json();
  },

  async getPeerConfig(peerId) {
    const res = await fetch(this.api + "/api/nodes/" + this.nodeId + "/network/config/" + encodeURIComponent(peerId));
    if (!res.ok) throw new Error("getPeerConfig failed: " + res.status);
    return await res.json();
  }
};
</script>
`;

export function HtmlTab({
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
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const prevVisible = useRef(false);
  const prevNodeId = useRef(nodeId);

  useEffect(() => {
    const nodeChanged = nodeId !== prevNodeId.current;
    if (visible && (!prevVisible.current || nodeChanged)) {
      loadHtml();
    }
    prevVisible.current = !!visible;
    prevNodeId.current = nodeId;
  }, [visible, nodeId]);

  async function loadHtml() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/files/${encodeURIComponent(filename)}`);
      const data = await res.json();
      if (data.content) {
        // Prepend the Paradise bridge script
        const bridge = PARADISE_BRIDGE(nodeId, api);
        setHtml(bridge + data.content);
      } else {
        setHtml(null);
      }
    } catch (err) {
      setError("Failed to load");
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 8 }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: "var(--red)", fontSize: 11, padding: 8 }}>
        {error}
      </div>
    );
  }

  if (!html) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 8, textAlign: "center" }}>
        No {filename} yet
      </div>
    );
  }

  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        borderRadius: 4,
        background: "var(--bg)",
      }}
    />
  );
}
