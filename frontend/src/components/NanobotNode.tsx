"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
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
  mdiArrowCollapse,
  mdiViewDashboard,
  mdiContentCopy,
  mdiRestart,
  mdiWrench,
} from "@mdi/js";
import { useCanvasStore } from "@/store/canvasStore";
import { ChatTab } from "./ChatTab";
import { ConfigTab } from "./ConfigTab";
import { LogsTab } from "./LogsTab";
import { InfoTab } from "./InfoTab";
import { FileTab } from "./FileTab";
import { HtmlTab } from "./HtmlTab";

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
];

type ObjectSubTab = "dashboard" | "obj-config" | "commands" | "children";

const OBJECT_SUBS: { key: ObjectSubTab; label: string; file: string }[] = [
  { key: "dashboard", label: "Dashboard", file: "dashboard.html" },
  { key: "obj-config", label: "Config", file: "config.html" },
  { key: "commands", label: "Commands", file: "commands.html" },
  { key: "children", label: "Children", file: "children.html" },
];

export function NanobotNode({ data }: NodeProps) {
  const [activeTab, setActiveTab] = useState<TopTab>(
    (data as any).identity ? "object" : "chat"
  );
  const [agentSub, setAgentSub] = useState<string>("soul");
  const [objectSub, setObjectSub] = useState<ObjectSubTab>("dashboard");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState((data as any).label);
  // Sync name when data.label changes (e.g. from PARADISE.rename via store)
  useEffect(() => { setName((data as any).label); }, [(data as any).label]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { api, toggleExpanded, removeNode, updateNodeIdentity, updateNodeName, updateNodeAgentStatus, addNode } = useCanvasStore();
  const nodeId = (data as any).nodeId;
  const label = name;
  const containerStatus = (data as any).containerStatus;
  const expanded = (data as any).expanded;
  const identity = (data as any).identity;
  const agentStatus = (data as any).agentStatus as string | null;
  const agentStatusMessage = (data as any).agentStatusMessage as string | null;
  const genesisPrompt = (data as any).genesisPrompt;
  const genesisActive = (data as any).genesisActive;

  // Agent-reported status overrides container status for the dot color
  const statusColor = agentStatus
    ? agentStatus === "ok"
      ? "var(--green)"
      : agentStatus === "warning"
        ? "var(--yellow)"
        : agentStatus === "error"
          ? "var(--red)"
          : "var(--green)"
    : containerStatus === "running"
      ? "var(--green)"
      : containerStatus === "error"
        ? "var(--red)"
        : "var(--yellow)";

  // Listen for postMessage from PARADISE bridge in iframes
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object" || msg.nodeId !== nodeId) return;
      if (msg.type === "paradise:rename") {
        setName(msg.name);
        updateNodeName(nodeId, msg.name);
      } else if (msg.type === "paradise:status") {
        updateNodeAgentStatus(nodeId, msg.status, msg.message);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [nodeId, updateNodeName, updateNodeAgentStatus]);

  const identityColor = identity?.color || null;

  // Show Object tab only when agent has identity (been through genesis)
  const topTabs = identity
    ? BASE_TABS
    : BASE_TABS.filter((t) => t.key !== "object");

  // Custom markdown tabs from identity.tabs
  const customAgentTabs: { key: string; label: string; file: string }[] =
    identity?.tabs?.map((t: { name: string; file: string }) => ({
      key: `custom:${t.file}`,
      label: t.name,
      file: t.file,
    })) || [];
  const allAgentSubs = [...AGENT_SUBS, ...customAgentTabs];

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

  const handleGenesisComplete = useCallback(async () => {
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/identity`);
      const data = await res.json();
      if (data.identity) {
        updateNodeIdentity(nodeId, data.identity);
      }
    } catch (err) {
      console.error("Failed to fetch identity:", err);
    }
  }, [api, nodeId, updateNodeIdentity]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Dismiss context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("click", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const handleClone = async () => {
    setContextMenu(null);
    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const node = await res.json();
      addNode({
        id: node.id,
        position: { x: node.position_x, y: node.position_y },
        data: {
          label: node.name,
          nodeId: node.id,
          containerStatus: node.container_status,
          expanded: false,
          identity: node.identity || null,
          agentStatus: node.agent_status || null,
          agentStatusMessage: node.agent_status_message || null,
        },
      });
    } catch (err) {
      console.error("Clone failed:", err);
    }
  };

  const handleRestart = async () => {
    setContextMenu(null);
    try {
      await fetch(`${api}/api/nodes/${nodeId}/restart`, { method: "POST" });
    } catch (err) {
      console.error("Restart failed:", err);
    }
  };

  const handleRebuild = async () => {
    setContextMenu(null);
    try {
      await fetch(`${api}/api/nodes/${nodeId}/rebuild`, { method: "POST" });
    } catch (err) {
      console.error("Rebuild failed:", err);
    }
  };

  const contextMenuItems = [
    { icon: mdiContentCopy, label: "Clone", action: handleClone },
    { icon: mdiRestart, label: "Restart", action: handleRestart },
    { icon: mdiWrench, label: "Rebuild", action: handleRebuild },
    { icon: mdiDeleteOutline, label: "Delete", action: () => { setContextMenu(null); setShowDeleteConfirm(true); }, color: "var(--red)" },
  ];

  const contextMenuEl = contextMenu && (
    <div
      className="nodrag nowheel"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: contextMenu.y,
        left: contextMenu.x,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "4px 0",
        zIndex: 9999,
        minWidth: 140,
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
      }}
    >
      {contextMenuItems.map((item, i) => (
        <button
          key={item.label}
          onClick={item.action}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "6px 12px",
            background: "transparent",
            border: "none",
            borderTop: i === contextMenuItems.length - 1 ? "1px solid var(--border)" : "none",
            color: item.color || "var(--text)",
            cursor: "pointer",
            fontSize: 11,
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Icon path={item.icon} size={0.55} color={item.color || "var(--text-muted)"} />
          {item.label}
        </button>
      ))}
    </div>
  );

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
        onContextMenu={handleContextMenu}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: identityColor
              ? `${identityColor}15`
              : "var(--bg-card)",
            border: `2px solid ${identityColor || "var(--border)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {identity?.emoji ? (
            <span style={{ fontSize: 24, lineHeight: 1 }}>{identity.emoji}</span>
          ) : (
            <Icon path={mdiRobot} size={1.1} color="var(--text-muted)" />
          )}
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
              animation: thinking ? "pulse-dot 1.2s ease-in-out infinite" : undefined,
            }}
            title={agentStatusMessage || undefined}
          />
          {genesisActive && [0, 1, 2].map((i) => (
            <div
              key={`gp-${i}`}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 2 + (i % 2),
                height: 2 + (i % 2),
                marginTop: -(1 + (i % 2) * 0.5),
                marginLeft: -(1 + (i % 2) * 0.5),
                borderRadius: "50%",
                background: identityColor || "var(--accent)",
                boxShadow: `0 0 4px 1px ${identityColor || "var(--accent)"}`,
                animation: "genesis-orbit-circle 3s linear infinite",
                animationDelay: `${i}s`,
                pointerEvents: "none",
              }}
            />
          ))}
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
          title={identity?.description || undefined}
        >
          {label}
        </span>
        <style>{`
          @keyframes pulse-dot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(1.3); }
          }
          @keyframes genesis-orbit-circle {
            from { transform: rotate(0deg) translateX(30px); }
            to { transform: rotate(360deg) translateX(30px); }
          }
        `}</style>
        {contextMenuEl}
      </div>
    );
  }

  // ─── Expanded view ───
  return (
    <div style={{ position: "relative", width: 320, height: 380 }} onContextMenu={handleContextMenu}>
      {/* Genesis particle constellation */}
      {genesisActive && [0, 1, 2, 3, 4].map((i) => (
        <div
          key={`gp-${i}`}
          style={{
            position: "absolute",
            width: 3 + (i % 2),
            height: 3 + (i % 2),
            borderRadius: "50%",
            background: identityColor || "var(--accent)",
            boxShadow: `0 0 6px 2px ${identityColor || "var(--accent)"}`,
            animation: "genesis-orbit-rect 4s linear infinite",
            animationDelay: `${(i * 4) / 5}s`,
            zIndex: 20,
            pointerEvents: "none",
            opacity: 0.6 + (i % 3) * 0.15,
          }}
        />
      ))}
      <div
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${identityColor || "var(--border)"}`,
          borderRadius: 8,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontSize: 13,
          position: "relative",
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
          {identity?.emoji ? (
            <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{identity.emoji}</span>
          ) : (
            <span
              style={{
                width: 8,
                height: 8,
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
          {genesisActive && (
            <span style={{ fontSize: 10, color: "var(--yellow)", marginRight: 4 }}>
              genesis...
            </span>
          )}
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
        {topTabs.map((tab) => (
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
                  ? `2px solid ${identityColor || "var(--tab-active)"}`
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

      {/* Sub-tabs for object tab */}
      {activeTab === "object" && (
        <div
          className="nodrag nowheel"
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-card-header)",
          }}
        >
          {OBJECT_SUBS.map((sub) => (
            <button
              key={sub.key}
              onClick={() => setObjectSub(sub.key)}
              style={{
                flex: 1,
                padding: "4px 0",
                background: "transparent",
                border: "none",
                borderBottom:
                  objectSub === sub.key
                    ? `2px solid ${identityColor || "var(--tab-active)"}`
                    : "2px solid transparent",
                color:
                  objectSub === sub.key ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: objectSub === sub.key ? 600 : 400,
              }}
            >
              {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* Sub-tabs for agent tab */}
      {activeTab === "agent" && (
        <div
          className="nodrag nowheel"
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-card-header)",
            overflowX: customAgentTabs.length > 0 ? "auto" : undefined,
          }}
        >
          {allAgentSubs.map((sub) => (
            <button
              key={sub.key}
              onClick={() => setAgentSub(sub.key)}
              style={{
                flex: customAgentTabs.length > 0 ? "0 0 auto" : 1,
                padding: "4px 8px",
                background: "transparent",
                border: "none",
                borderBottom:
                  agentSub === sub.key
                    ? `2px solid ${identityColor || "var(--tab-active)"}`
                    : "2px solid transparent",
                color:
                  agentSub === sub.key ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: agentSub === sub.key ? 600 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "chat" ? "block" : "none", cursor: "auto", userSelect: "text" }}>
        <ChatTab
          nodeId={nodeId}
          api={api}
          genesisPrompt={genesisPrompt}
          onGenesisComplete={handleGenesisComplete}
          onThinkingChange={setThinking}
        />
      </div>
      <div className="nowheel nodrag" style={{ flex: 1, overflow: "hidden", display: activeTab === "object" ? "block" : "none" }}>
        {OBJECT_SUBS.map((sub) => (
          <div key={sub.key} style={{ height: "100%", display: objectSub === sub.key ? "block" : "none" }}>
            <HtmlTab nodeId={nodeId} api={api} filename={sub.file} visible={activeTab === "object" && objectSub === sub.key} />
          </div>
        ))}
      </div>
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "agent" ? "block" : "none", cursor: "auto", userSelect: "text" }}>
        {allAgentSubs.map((sub) => (
          <div key={sub.key} style={{ height: "100%", display: agentSub === sub.key ? "block" : "none" }}>
            <FileTab nodeId={nodeId} api={api} filename={sub.file} visible={activeTab === "agent" && agentSub === sub.key} />
          </div>
        ))}
      </div>
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "config" ? "block" : "none", cursor: "auto", userSelect: "text" }}>
        <ConfigTab nodeId={nodeId} api={api} />
      </div>
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "logs" ? "block" : "none", cursor: "auto", userSelect: "text" }}>
        <LogsTab nodeId={nodeId} api={api} />
      </div>
      <div className="nowheel nodrag" style={{ flex: 1, padding: 10, overflow: "hidden", display: activeTab === "info" ? "block" : "none", cursor: "auto", userSelect: "text" }}>
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

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
        @keyframes genesis-orbit-rect {
          0%, 100% { top: -2px; left: 0; }
          22.86% { top: -2px; left: calc(100% - 4px); }
          50% { top: calc(100% - 2px); left: calc(100% - 4px); }
          72.86% { top: calc(100% - 2px); left: 0; }
        }
      `}</style>
      {contextMenuEl}
      </div>
    </div>
  );
}
