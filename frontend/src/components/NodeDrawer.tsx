"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@mdi/react";
import {
  mdiChat,
  mdiRobot,
  mdiCog,
  mdiText,
  mdiInformation,
  mdiPencil,
  mdiDeleteOutline,
  mdiClose,
  mdiViewDashboard,
} from "@mdi/js";
import { useCanvasStore } from "@/store/canvasStore";
import { ChatTab } from "./ChatTab";
import { ConfigTab } from "./ConfigTab";
import { LogsTab } from "./LogsTab";
import { InfoTab } from "./InfoTab";
import { FileTab } from "./FileTab";
import { HtmlTab } from "./HtmlTab";
import { ChildrenTab } from "./ChildrenTab";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { resolveMdiIcon } from "@/lib/mdiIcons";
import type { NanobotNodeData } from "@/types";

type TopTab = "chat" | "object" | "agent" | "config" | "logs" | "info";

const BASE_TABS: { key: TopTab; icon: string; title: string }[] = [
  { key: "chat", icon: mdiChat, title: "Chat" },
  { key: "object", icon: mdiViewDashboard, title: "Object" },
  { key: "agent", icon: mdiRobot, title: "Agent" },
  { key: "config", icon: mdiCog, title: "Config" },
  { key: "logs", icon: mdiText, title: "Logs" },
  { key: "info", icon: mdiInformation, title: "Info" },
];

const AGENT_SUBS: { key: string; label: string; file: string }[] = [
  { key: "soul", label: "Soul", file: "SOUL.md" },
  { key: "agents", label: "Agents", file: "AGENTS.md" },
  { key: "user", label: "User", file: "USER.md" },
  { key: "heartbeat", label: "Heartbeat", file: "HEARTBEAT.md" },
  { key: "identity", label: "Identity", file: "identity.json" },
];

type ObjectSubTab = "dashboard" | "obj-config" | "commands" | "children";

const OBJECT_HTML_SUBS: { key: ObjectSubTab; label: string; file: string }[] = [
  { key: "dashboard", label: "Dashboard", file: "dashboard.html" },
  { key: "obj-config", label: "Config", file: "config.html" },
  { key: "commands", label: "Commands", file: "commands.html" },
];

const OBJECT_SUBS: { key: ObjectSubTab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "obj-config", label: "Config" },
  { key: "commands", label: "Commands" },
  { key: "children", label: "Children" },
];

const TAB_CONTENT_STYLE: React.CSSProperties = {
  flex: 1,
  padding: 12,
  overflow: "hidden",
};

interface NodeDrawerProps {
  data: NanobotNodeData;
  onClose: () => void;
}

export function NodeDrawer({ data, onClose }: NodeDrawerProps) {
  const {
    nodeId,
    containerStatus,
    identity,
    agentStatus,
    agentStatusMessage,
    genesisPrompt,
    genesisActive,
  } = data;

  const [activeTab, setActiveTab] = useState<TopTab>(identity ? "object" : "chat");
  const [agentSub, setAgentSub] = useState("soul");
  const [objectSub, setObjectSub] = useState<ObjectSubTab>("dashboard");
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [thinking, setThinking] = useState(false);
  const skipBlurSave = useRef(false);
  const prevNodeId = useRef(nodeId);
  const { api, updateNodeIdentity, updateNodeName, updateNodeAgentStatus, updateNodeGauge } = useCanvasStore();

  const handleIdentityUpdate = useCallback(
    (identity: Record<string, unknown>) => updateNodeIdentity(nodeId, identity),
    [nodeId, updateNodeIdentity],
  );

  const handleGenesisComplete = useCallback(async () => {
    // Identity is already handled by handleIdentityUpdate via the WebSocket event.
    // This is a fallback in case the event was missed.
    const res = await fetch(`${api}/api/nodes/${nodeId}/identity`);
    if (!res.ok) return;
    const result = await res.json();
    if (result.identity) updateNodeIdentity(nodeId, result.identity);
  }, [api, nodeId, updateNodeIdentity]);

  // Reset state when switching nodes (not on identity updates)
  useEffect(() => {
    if (prevNodeId.current !== nodeId) {
      setActiveTab(identity ? "object" : "chat");
      setAgentSub("soul");
      setObjectSub("dashboard");
      setEditing(false);
      setShowDeleteConfirm(false);
      prevNodeId.current = nodeId;
    }
  }, [nodeId, identity]);

  // Listen for postMessage from PARADISE bridge in iframes
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object" || msg.nodeId !== nodeId) return;
      if (msg.type === "paradise:rename") {
        updateNodeName(nodeId, msg.name);
      } else if (msg.type === "paradise:status") {
        updateNodeAgentStatus(nodeId, msg.status, msg.message);
      } else if (msg.type === "paradise:gauge") {
        updateNodeGauge(nodeId, msg.value ?? null, msg.label, msg.unit);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [nodeId, updateNodeName, updateNodeAgentStatus, updateNodeGauge]);

  const identityColor = identity?.color || null;
  const topTabs = identity ? BASE_TABS : BASE_TABS.filter((t) => t.key !== "object");

  const customAgentTabs: { key: string; label: string; file: string }[] =
    identity?.tabs?.map((t) => ({
      key: `custom:${t.file}`,
      label: t.name,
      file: t.file,
    })) || [];
  const allAgentSubs = [...AGENT_SUBS, ...customAgentTabs];

  const saveName = async (newName: string) => {
    if (skipBlurSave.current) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === data.label) {
      setEditing(false);
      return;
    }
    skipBlurSave.current = true;
    const res = await fetch(`${api}/api/nodes/${nodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) updateNodeName(nodeId, trimmed);
    setEditing(false);
    skipBlurSave.current = false;
  };

  const label = editing ? editingName : data.label;

  const statusColor = (() => {
    if (agentStatus) {
      switch (agentStatus) {
        case "ok": return "var(--green)";
        case "warning": return "var(--yellow)";
        case "error": return "var(--red)";
        default: return "var(--green)";
      }
    }
    switch (containerStatus) {
      case "running": return "var(--green)";
      case "error": return "var(--red)";
      default: return "var(--yellow)";
    }
  })();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 420,
        height: "100vh",
        background: "var(--bg-card)",
        borderLeft: `1px solid ${identityColor || "var(--border)"}`,
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
          padding: "10px 14px",
          background: "var(--bg-card-header)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          {identity?.icon && resolveMdiIcon(identity.icon) ? (
            <Icon path={resolveMdiIcon(identity.icon)!} size={0.55} color={identityColor || "var(--text-muted)"} style={{ flexShrink: 0 }} />
          ) : identity?.emoji ? (
            <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{identity.emoji}</span>
          ) : (
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: statusColor,
                display: "inline-block",
                flexShrink: 0,
                animation: thinking ? "pulse-dot 1.2s ease-in-out infinite" : undefined,
              }}
            />
          )}
          {editing ? (
            <input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={(e) => saveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName(editingName);
                if (e.key === "Escape") {
                  skipBlurSave.current = true;
                  setEditing(false);
                  setTimeout(() => { skipBlurSave.current = false; }, 0);
                }
              }}
              autoFocus
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                color: "var(--text)",
                fontWeight: 600,
                fontSize: 14,
                padding: "2px 6px",
                outline: "none",
                width: "100%",
                minWidth: 0,
              }}
            />
          ) : (
            <>
              <span style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </span>
              <button
                onClick={() => { setEditingName(data.label); setEditing(true); }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "0 2px",
                  flexShrink: 0,
                  lineHeight: 0,
                  display: "flex",
                  alignItems: "center",
                }}
                title="Rename"
              >
                <Icon path={mdiPencil} size={0.55} />
              </button>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {genesisActive && (
            <span style={{ fontSize: 10, color: "var(--yellow)", marginRight: 4 }}>genesis...</span>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
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
            title="Delete nanobot"
          >
            <Icon path={mdiDeleteOutline} size={0.6} />
          </button>
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
            title="Close"
          >
            <Icon path={mdiClose} size={0.7} />
          </button>
        </div>
      </div>

      {/* Top-level tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--bg-card-header)" }}>
        {topTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: "7px 0",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.key
                ? `2px solid ${identityColor || "var(--tab-active)"}`
                : "2px solid transparent",
              cursor: "pointer",
              color: activeTab === tab.key ? "var(--text)" : "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              transition: "color 0.15s",
              fontSize: 11,
            }}
            title={tab.title}
          >
            <Icon path={tab.icon} size={0.6} />
            <span>{tab.title}</span>
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
      {activeTab === "object" && (
        <SubTabBar tabs={OBJECT_SUBS} active={objectSub} onSelect={(k) => setObjectSub(k as ObjectSubTab)} accentColor={identityColor} />
      )}
      {activeTab === "agent" && (
        <SubTabBar tabs={allAgentSubs} active={agentSub} onSelect={setAgentSub} accentColor={identityColor} scrollable={customAgentTabs.length > 0} />
      )}

      {/* Tab content */}
      <div style={{ ...TAB_CONTENT_STYLE, display: activeTab === "chat" ? "flex" : "none", flexDirection: "column" }}>
        <ChatTab
          key={nodeId}
          nodeId={nodeId}
          api={api}
          visible={activeTab === "chat"}
          genesisPrompt={genesisPrompt}
          onGenesisComplete={handleGenesisComplete}
          onIdentityUpdate={handleIdentityUpdate}
          onThinkingChange={setThinking}
        />
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: activeTab === "object" ? "block" : "none" }}>
        {OBJECT_HTML_SUBS.map((sub) => (
          <div key={sub.key} style={{ height: "100%", display: objectSub === sub.key ? "block" : "none" }}>
            <HtmlTab nodeId={nodeId} api={api} filename={sub.file} visible={activeTab === "object" && objectSub === sub.key} />
          </div>
        ))}
        <div style={{ height: "100%", display: objectSub === "children" ? "block" : "none", overflow: "auto", padding: 8 }}>
          <ChildrenTab nodeId={nodeId} api={api} />
        </div>
      </div>
      <div style={{ ...TAB_CONTENT_STYLE, display: activeTab === "agent" ? "flex" : "none", flexDirection: "column" }}>
        {allAgentSubs.map((sub) => (
          <div key={sub.key} style={{ height: "100%", display: agentSub === sub.key ? "block" : "none" }}>
            <FileTab nodeId={nodeId} api={api} filename={sub.file} visible={activeTab === "agent" && agentSub === sub.key} />
          </div>
        ))}
      </div>
      <div style={{ ...TAB_CONTENT_STYLE, display: activeTab === "config" ? "flex" : "none", flexDirection: "column" }}>
        <ConfigTab nodeId={nodeId} api={api} />
      </div>
      <div style={{ ...TAB_CONTENT_STYLE, display: activeTab === "logs" ? "flex" : "none", flexDirection: "column" }}>
        <LogsTab nodeId={nodeId} api={api} />
      </div>
      <div style={{ ...TAB_CONTENT_STYLE, display: activeTab === "info" ? "flex" : "none", flexDirection: "column" }}>
        <InfoTab nodeId={nodeId} api={api} />
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal nodeId={nodeId} label={data.label} onClose={() => setShowDeleteConfirm(false)} />
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

function SubTabBar({
  tabs,
  active,
  onSelect,
  accentColor,
  scrollable,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
  accentColor: string | null;
  scrollable?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card-header)",
        overflowX: scrollable ? "auto" : undefined,
      }}
    >
      {tabs.map((sub) => (
        <button
          key={sub.key}
          onClick={() => onSelect(sub.key)}
          style={{
            flex: scrollable ? "0 0 auto" : 1,
            padding: scrollable ? "4px 10px" : "4px 0",
            background: "transparent",
            border: "none",
            borderBottom:
              active === sub.key
                ? `2px solid ${accentColor || "var(--tab-active)"}`
                : "2px solid transparent",
            color: active === sub.key ? "var(--text)" : "var(--text-muted)",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: active === sub.key ? 600 : 400,
            whiteSpace: "nowrap",
          }}
        >
          {sub.label}
        </button>
      ))}
    </div>
  );
}
