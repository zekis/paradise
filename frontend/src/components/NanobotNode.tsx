"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useRef, useState } from "react";
import Icon from "@mdi/react";
import {
  mdiChat,
  mdiRobot,
  mdiCog,
  mdiText,
  mdiInformation,
  mdiPencil,
  mdiDeleteOutline,
  mdiArrowCollapse,
} from "@mdi/js";
import { useCanvasStore } from "@/store/canvasStore";
import { ChatTab } from "./ChatTab";
import { ConfigTab } from "./ConfigTab";
import { LogsTab } from "./LogsTab";
import { InfoTab } from "./InfoTab";
import { FileTab } from "./FileTab";

type TopTab = "chat" | "agent" | "config" | "logs" | "info";

const TOP_TABS: { key: TopTab; icon: string; title: string }[] = [
  { key: "chat", icon: mdiChat, title: "Chat" },
  { key: "agent", icon: mdiRobot, title: "Agent" },
  { key: "config", icon: mdiCog, title: "Config" },
  { key: "logs", icon: mdiText, title: "Logs" },
  { key: "info", icon: mdiInformation, title: "Info" },
];

type AgentSubTab = "soul" | "agents" | "user" | "heartbeat";

const AGENT_SUBS: { key: AgentSubTab; label: string; file: string }[] = [
  { key: "soul", label: "Soul", file: "SOUL.md" },
  { key: "agents", label: "Agents", file: "AGENTS.md" },
  { key: "user", label: "User", file: "USER.md" },
  { key: "heartbeat", label: "Heartbeat", file: "HEARTBEAT.md" },
];

export function NanobotNode({ data }: NodeProps) {
  const [activeTab, setActiveTab] = useState<TopTab>("chat");
  const [agentSub, setAgentSub] = useState<AgentSubTab>("soul");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState((data as any).label);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { api, toggleExpanded, removeNode } = useCanvasStore();
  const nodeId = (data as any).nodeId;
  const label = name;
  const containerStatus = (data as any).containerStatus;
  const expanded = (data as any).expanded;

  const statusColor =
    containerStatus === "running"
      ? "var(--green)"
      : containerStatus === "error"
        ? "var(--red)"
        : "var(--yellow)";

  const saveName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === (data as any).label) {
      setName((data as any).label);
      setEditing(false);
      return;
    }
    try {
      await fetch(`${api}/api/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      setName(trimmed);
    } catch {
      setName((data as any).label);
    }
    setEditing(false);
  };

  // ─── Collapsed view ───
  if (!expanded) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          width: 80,
        }}
        onDoubleClick={() => toggleExpanded(nodeId)}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--bg-card)",
            border: "2px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <Icon path={mdiRobot} size={1.1} color="var(--text-muted)" />
          <span
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: statusColor,
              border: "2px solid var(--bg-card)",
            }}
          />
        </div>
        <span
          style={{
            fontSize: 9,
            color: "var(--text-muted)",
            textAlign: "center",
            width: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  // ─── Expanded view ───
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        width: 320,
        height: 380,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontSize: 13,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          background: "var(--bg-card-header)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusColor,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          {editing ? (
            <input
              className="nodrag"
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => saveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName(name);
                if (e.key === "Escape") { setName((data as any).label); setEditing(false); }
              }}
              autoFocus
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                color: "var(--text)",
                fontWeight: 600,
                fontSize: 13,
                padding: "1px 4px",
                outline: "none",
                width: "100%",
                minWidth: 0,
              }}
            />
          ) : (
            <>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </span>
              <button
                className="nodrag"
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
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
                <Icon path={mdiPencil} size={0.5} />
              </button>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            className="nodrag"
            onClick={() => toggleExpanded(nodeId)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0 2px",
              lineHeight: 0,
              display: "flex",
              alignItems: "center",
            }}
            title="Collapse"
          >
            <Icon path={mdiArrowCollapse} size={0.55} />
          </button>
          <button
            className="nodrag"
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0 2px",
              lineHeight: 0,
              display: "flex",
              alignItems: "center",
            }}
            title="Delete nanobot"
          >
            <Icon path={mdiDeleteOutline} size={0.55} />
          </button>
        </div>
      </div>

      {/* Top-level icon tabs */}
      <div
        className="nodrag"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card-header)",
        }}
      >
        {TOP_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: "5px 0",
              background: "transparent",
              border: "none",
              borderBottom:
                activeTab === tab.key
                  ? "2px solid var(--tab-active)"
                  : "2px solid transparent",
              cursor: "pointer",
              color: activeTab === tab.key ? "var(--text)" : "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s",
            }}
            title={tab.title}
          >
            <Icon path={tab.icon} size={0.65} />
          </button>
        ))}
      </div>

      {/* Sub-tabs for agent tab */}
      {activeTab === "agent" && (
        <div
          className="nodrag"
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-card-header)",
          }}
        >
          {AGENT_SUBS.map((sub) => (
            <button
              key={sub.key}
              onClick={() => setAgentSub(sub.key)}
              style={{
                flex: 1,
                padding: "4px 0",
                background: "transparent",
                border: "none",
                borderBottom:
                  agentSub === sub.key
                    ? "2px solid var(--tab-active)"
                    : "2px solid transparent",
                color:
                  agentSub === sub.key ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: agentSub === sub.key ? 600 : 400,
              }}
            >
              {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "chat" ? "block" : "none" }}>
        <ChatTab nodeId={nodeId} api={api} />
      </div>
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "agent" ? "block" : "none" }}>
        {AGENT_SUBS.map((sub) => (
          <div key={sub.key} style={{ height: "100%", display: agentSub === sub.key ? "block" : "none" }}>
            <FileTab nodeId={nodeId} api={api} filename={sub.file} visible={activeTab === "agent" && agentSub === sub.key} />
          </div>
        ))}
      </div>
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "config" ? "block" : "none" }}>
        <ConfigTab nodeId={nodeId} api={api} />
      </div>
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "logs" ? "block" : "none" }}>
        <LogsTab nodeId={nodeId} api={api} />
      </div>
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "info" ? "block" : "none" }}>
        <InfoTab nodeId={nodeId} api={api} />
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          className="nodrag nowheel"
          onClick={() => setShowDeleteConfirm(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "20px 24px",
              width: 240,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon path={mdiDeleteOutline} size={0.8} color="var(--red)" />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Delete nanobot</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
              This will permanently delete <strong style={{ color: "var(--text)" }}>{label}</strong> and its container. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Remove from canvas immediately, delete in background
                  removeNode(nodeId);
                  fetch(`${api}/api/nodes/${nodeId}`, { method: "DELETE" }).catch((err) =>
                    console.error("Delete failed:", err)
                  );
                }}
                style={{
                  background: "var(--red)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
