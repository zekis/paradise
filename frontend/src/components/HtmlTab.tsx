"use client";

import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/store/themeStore";

// ─── Theme variable maps (mirroring globals.css) ───

const DARK_VARS: Record<string, string> = {
  "--p-bg": "#0a0a0a",
  "--p-bg-card": "#141414",
  "--p-text": "#e0e0e0",
  "--p-text-muted": "#888888",
  "--p-border": "#2a2a2a",
  "--p-accent": "#6366f1",
};

const LIGHT_VARS: Record<string, string> = {
  "--p-bg": "#f5f5f5",
  "--p-bg-card": "#ffffff",
  "--p-text": "#1a1a1a",
  "--p-text-muted": "#666666",
  "--p-border": "#d4d4d4",
  "--p-accent": "#6366f1",
};

function getThemeVars(resolved: "dark" | "light"): Record<string, string> {
  return resolved === "dark" ? DARK_VARS : LIGHT_VARS;
}

function cssVarsBlock(vars: Record<string, string>): string {
  return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
}

// ─── PARADISE bridge (injected into every iframe) ───

const PARADISE_BRIDGE = (nodeId: string, api: string, themeVars: Record<string, string>) => `
<style id="paradise-theme-vars">
:root{${cssVarsBlock(themeVars)}}
html,body{margin:0;padding:0;overflow-y:auto;overflow-x:hidden;background:var(--p-bg)!important;color:var(--p-text)!important;font-family:system-ui,sans-serif;font-size:12px;}
::-webkit-scrollbar{width:6px;}
::-webkit-scrollbar-track{background:var(--p-bg);}
::-webkit-scrollbar-thumb{background:var(--p-text-muted);border-radius:3px;opacity:0.4;}
*{scrollbar-width:thin;scrollbar-color:var(--p-text-muted) var(--p-bg);}
</style>
<style id="paradise-theme-overrides">
[style*="background:#0a0a0a"],[style*="background: #0a0a0a"],[style*="background-color:#0a0a0a"],[style*="background-color: #0a0a0a"]{background:var(--p-bg)!important;background-color:var(--p-bg)!important;}
[style*="background:#141414"],[style*="background: #141414"],[style*="background:#111"],[style*="background: #111"],[style*="background:#1a1a1a"],[style*="background: #1a1a1a"],[style*="background-color:#141414"],[style*="background-color: #141414"],[style*="background-color:#1a1a1a"],[style*="background-color: #1a1a1a"]{background:var(--p-bg-card)!important;background-color:var(--p-bg-card)!important;}
[style*="color:#e0e0e0"],[style*="color: #e0e0e0"]{color:var(--p-text)!important;}
[style*="color:#888"],[style*="color: #888"],[style*="color:#999"],[style*="color: #999"],[style*="color:#aaa"],[style*="color: #aaa"]{color:var(--p-text-muted)!important;}
[style*="border-color:#222"],[style*="border-color: #222"],[style*="border-color:#2a2a2a"],[style*="border-color: #2a2a2a"]{border-color:var(--p-border)!important;}
[style*="border:1px solid #222"],[style*="border: 1px solid #222"],[style*="border:1px solid #2a2a2a"],[style*="border: 1px solid #2a2a2a"]{border-color:var(--p-border)!important;}
[style*="scrollbar-color:#333"],[style*="scrollbar-color: #333"]{scrollbar-color:var(--p-text-muted) var(--p-bg)!important;}
</style>
<script>
window.addEventListener("message",function(e){
  if(e.data&&e.data.type==="paradise:theme"){
    var root=document.documentElement;
    var vars=e.data.vars;
    for(var k in vars) root.style.setProperty(k,vars[k]);
  }
});
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
  },

  async setGauge(value, label, unit) {
    const res = await fetch(this.api + "/api/nodes/" + this.nodeId + "/gauge", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: value, label: label || "", unit: unit || "" })
    });
    if (!res.ok) throw new Error("setGauge failed: " + res.status);
    window.parent.postMessage({ type: "paradise:gauge", nodeId: this.nodeId, value: value, label: label || "", unit: unit || "" }, "*");
  }
};
</script>
`;

// Module-level cache: avoids re-fetching on tab switches
const htmlCache = new Map<string, string>();

/** @internal Clear cache — exposed for tests only. */
export function _clearHtmlCache() { htmlCache.clear(); }

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
  const cacheKey = `${nodeId}:${filename}`;
  const [html, setHtml] = useState<string | null>(() => htmlCache.get(cacheKey) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const prevVisible = useRef(false);
  const prevNodeId = useRef(nodeId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resolved = useThemeStore((s) => s.resolved);

  useEffect(() => {
    const nodeChanged = nodeId !== prevNodeId.current;
    if (visible && (!prevVisible.current || nodeChanged)) {
      loadHtml();
    }
    prevVisible.current = !!visible;
    prevNodeId.current = nodeId;
  }, [visible, nodeId]);

  // Send theme to iframe whenever resolved theme changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow && html) {
      iframe.contentWindow.postMessage(
        { type: "paradise:theme", vars: getThemeVars(resolved) },
        "*"
      );
    }
  }, [resolved, html]);

  async function loadHtml() {
    const cached = htmlCache.get(cacheKey);
    // Show cached content immediately; only show spinner if no cache
    if (cached) {
      setHtml(cached);
    }
    setLoading(!cached);
    setError("");
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/files/${encodeURIComponent(filename)}`);
      const data = await res.json();
      if (data.content) {
        // Prepend the Paradise bridge script with current theme
        const bridge = PARADISE_BRIDGE(nodeId, api, getThemeVars(resolved));
        const full = bridge + data.content;
        htmlCache.set(cacheKey, full);
        setHtml(full);
      } else {
        htmlCache.delete(cacheKey);
        setHtml(null);
      }
    } catch (err) {
      console.error(`Failed to load HTML file "${filename}" for node ${nodeId}:`, err);
      if (!cached) setError("Failed to load");
    }
    setLoading(false);
  }

  const sendThemeToIframe = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "paradise:theme", vars: getThemeVars(resolved) },
      "*"
    );
  };

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
      ref={iframeRef}
      srcDoc={html}
      onLoad={sendThemeToIframe}
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
