"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@mdi/react";
import { mdiPlus, mdiChevronRight } from "@mdi/js";
import { resolveMdiIcon } from "@/lib/mdiIcons";
import { useCanvasStore } from "@/store/canvasStore";
import type { NanobotNodeData, Recommendation } from "@/types";
import { mapApiNodeToNodeData } from "@/lib/mappers";

interface ChildNode {
  id: string;
  name: string;
  identity: { icon?: string; emoji?: string; color?: string; description?: string } | null;
  agent_status: string | null;
  agent_status_message: string | null;
}

export function ChildrenTab({ nodeId, api }: { nodeId: string; api: string }) {
  const [children, setChildren] = useState<ChildNode[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);
  const addNode = useCanvasStore((s) => s.addNode);
  const addEdge = useCanvasStore((s) => s.addEdge);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [networkRes, recsRes] = await Promise.all([
        fetch(`${api}/api/nodes/${nodeId}/network`),
        fetch(`${api}/api/nodes/${nodeId}/recommendations`),
      ]);
      if (networkRes.ok) {
        const network = await networkRes.json();
        setChildren(network.children || []);
      }
      if (recsRes.ok) {
        const recsData = await recsRes.json();
        setRecommendations(recsData.recommendations || []);
      }
    } catch (error) {
      console.error(`Failed to fetch children/recommendations for node ${nodeId}:`, error);
    }
    setLoading(false);
  }, [api, nodeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Listen for SSE recommendations_ready events
  useEffect(() => {
    const es = new EventSource(`${api}/api/events/stream`);
    const handler = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.event === "recommendations_ready" && msg.node_id === nodeId) {
          fetchData();
        }
      } catch (error) {
        console.warn('Failed to parse SSE recommendations_ready event:', error);
      }
    };
    es.onmessage = handler;
    return () => es.close();
  }, [api, nodeId, fetchData]);

  // Fallback polling: re-fetch every 10s while no recommendations exist
  useEffect(() => {
    if (recommendations.length > 0) return;
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [recommendations.length, fetchData]);

  const handleCreateChild = async (rec: Recommendation) => {
    setCreating(rec.name);

    // Immediately add placeholder node + edge
    const tempId = `placeholder-${crypto.randomUUID()}`;
    const tempEdgeId = `placeholder-edge-${crypto.randomUUID()}`;
    addNode({
      id: tempId,
      position: { x: 0, y: 0 },
      data: {
        label: rec.name,
        nodeId: tempId,
        containerStatus: null,
        identity: null,
        agentStatus: null,
        agentStatusMessage: null,
        placeholder: true,
      } satisfies NanobotNodeData,
    });
    addEdge({
      id: tempEdgeId,
      source: nodeId,
      target: tempId,
      sourceHandle: "bottom-s",
      targetHandle: "top-t",
    });

    // Optimistically update lists
    setRecommendations((prev) => prev.filter((r) => r.name !== rec.name));
    setChildren((prev) => [
      ...prev,
      { id: tempId, name: rec.name, identity: null, agent_status: null, agent_status_message: null },
    ]);

    try {
      const res = await fetch(`${api}/api/nodes/${nodeId}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: rec.name,
          genesis_prompt: rec.genesis_prompt,
          icon: rec.icon,
          emoji: rec.emoji,
          description: rec.description,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const n = data.node;

        // Replace placeholder with real node
        useCanvasStore.getState().replaceNode(tempId, {
          id: n.id,
          position: { x: n.position_x, y: n.position_y },
          data: mapApiNodeToNodeData(n, {
            genesisPrompt: data.genesis_prompt,
            genesisActive: true,
          }),
        });

        // Update children list with real ID
        setChildren((prev) =>
          prev.map((c) => c.id === tempId ? { ...c, id: n.id } : c)
        );

        setSelectedNodeId(n.id);
      } else {
        // On failure: remove placeholder and restore recommendation
        useCanvasStore.getState().removeNode(tempId);
        setRecommendations((prev) => [...prev, rec]);
        setChildren((prev) => prev.filter((c) => c.id !== tempId));
      }
    } catch (error) {
      console.error(`Failed to create child node "${rec.name}" for node ${nodeId}:`, error);
      useCanvasStore.getState().removeNode(tempId);
      setRecommendations((prev) => [...prev, rec]);
      setChildren((prev) => prev.filter((c) => c.id !== tempId));
    }
    setCreating(null);
  };

  // Filter out recommendations that match existing children by name
  const childNames = new Set(children.map((c) => c.name.toLowerCase()));
  const filteredRecs = recommendations.filter(
    (r) => !childNames.has(r.name.toLowerCase()),
  );

  if (loading) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 12, textAlign: "center" }}>
        Loading...
      </div>
    );
  }

  const hasContent = children.length > 0 || filteredRecs.length > 0;

  if (!hasContent) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 16, textAlign: "center" }}>
        No children or recommendations yet.
        <br />
        <span style={{ fontSize: 10, opacity: 0.7 }}>
          Run genesis to discover child nodes.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 4, height: "100%", overflowY: "auto" }}>
      {/* Existing children */}
      {children.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Connected ({children.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedNodeId(child.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: "var(--overlay-subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--text)",
                  fontSize: 12,
                  width: "100%",
                }}
              >
                {/* Icon / emoji / status dot */}
                {child.identity?.icon && resolveMdiIcon(child.identity.icon) ? (
                  <Icon
                    path={resolveMdiIcon(child.identity.icon)!}
                    size={0.55}
                    color={child.identity.color || "var(--text-muted)"}
                    style={{ flexShrink: 0 }}
                  />
                ) : child.identity?.emoji ? (
                  <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{child.identity.emoji}</span>
                ) : (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        child.agent_status === "ok"
                          ? "var(--green)"
                          : child.agent_status === "warning"
                            ? "var(--yellow)"
                            : child.agent_status === "error"
                              ? "var(--red)"
                              : "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {child.name}
                  </div>
                  {child.identity?.description && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {child.identity.description}
                    </div>
                  )}
                </div>
                <Icon path={mdiChevronRight} size={0.5} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {filteredRecs.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Recommended ({filteredRecs.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filteredRecs.map((rec) => {
              const isCreating = creating === rec.name;
              return (
                <div
                  key={rec.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    background: "var(--overlay-subtle)",
                    border: "1px dashed var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  {/* Icon / emoji */}
                  {rec.icon && resolveMdiIcon(rec.icon) ? (
                    <Icon
                      path={resolveMdiIcon(rec.icon)!}
                      size={0.55}
                      color="var(--text-muted)"
                      style={{ flexShrink: 0 }}
                    />
                  ) : rec.emoji ? (
                    <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{rec.emoji}</span>
                  ) : (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--text-muted)",
                        flexShrink: 0,
                        opacity: 0.4,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rec.name}
                    </div>
                    {rec.description && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleCreateChild(rec)}
                    disabled={isCreating}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "4px 8px",
                      background: isCreating ? "var(--overlay-subtle)" : "rgba(99, 102, 241, 0.15)",
                      border: "none",
                      borderRadius: 4,
                      color: isCreating ? "var(--text-muted)" : "var(--text)",
                      fontSize: 10,
                      cursor: isCreating ? "default" : "pointer",
                      flexShrink: 0,
                      opacity: isCreating ? 0.6 : 1,
                    }}
                  >
                    <Icon path={mdiPlus} size={0.4} />
                    {isCreating ? "Creating..." : "Create"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
