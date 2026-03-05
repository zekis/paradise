"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Node,
  type Edge,
  type Viewport,
  type Connection,
  type FinalConnectionState,
} from "@xyflow/react";
import { useCanvasStore } from "@/store/canvasStore";
import { API_URL as API } from "@/lib/api";
import type { NodeIdentity } from "@/types";
import { mapApiNodeToFlowNode, mapApiNodeToNodeData, type ApiNode } from "@/lib/mappers";

type NodeSetter = (fn: (nds: Node[]) => Node[]) => void;
type EdgeSetter = (fn: (eds: Edge[]) => Edge[]) => void;

function wireStoreActions(setNodes: NodeSetter, setEdges: EdgeSetter) {
  const store = useCanvasStore.getState();

  store.setRemoveNode((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (store.selectedNodeId === nodeId) store.setSelectedNodeId(null);
  });

  store.setRemoveEdge((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    fetch(`${API}/api/edges/${edgeId}`, { method: "DELETE" }).catch((error) => {
      console.error(`Failed to delete edge ${edgeId}:`, error);
    });
  });

  store.setUpdateNodeIdentity((nodeId: string, identity: NodeIdentity) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, identity, genesisActive: false, genesisPrompt: undefined } }
          : n
      )
    );
  });

  store.setUpdateNodeName((nodeId: string, name: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label: name } } : n))
    );
  });

  store.setUpdateNodeAgentStatus((nodeId: string, status: string | null, message?: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, agentStatus: status, agentStatusMessage: message } }
          : n
      )
    );
  });

  store.setUpdateNodeGauge((nodeId: string, value: number | null, label?: string, unit?: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, gaugeValue: value, gaugeLabel: label || null, gaugeUnit: unit || null } }
          : n
      )
    );
  });

  store.setAddNode((node: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }) => {
    setNodes((nds) => [
      ...nds,
      { id: node.id, type: "nanobot" as const, position: node.position, data: node.data, style: { width: 80, height: 92 } },
    ]);
  });

  store.setAddEdge((edge: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }) => {
    setEdges((eds) => [
      ...eds,
      { id: edge.id, source: edge.source, target: edge.target, type: "smoothstep" as const, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle },
    ]);
  });

  store.setSetNodeRebuilding((nodeId: string, rebuilding: boolean) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, rebuilding } }
          : n
      )
    );
  });

  store.setSetNodeArchived((nodeId: string, archived: boolean, containerStatus?: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                archived,
                containerStatus: containerStatus || (archived ? "archived" : n.data.containerStatus),
                rebuilding: false,
              },
            }
          : n
      )
    );
  });

  store.setReplaceNode((tempId: string, realNode: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === tempId
          ? { id: realNode.id, type: "nanobot" as const, position: realNode.position, data: realNode.data, style: { width: 80, height: 92 } }
          : n
      )
    );
    setEdges((eds) =>
      eds.map((e) => {
        if (e.source === tempId) return { ...e, source: realNode.id };
        if (e.target === tempId) return { ...e, target: realNode.id };
        return e;
      })
    );
    if (store.selectedNodeId === tempId) {
      store.setSelectedNodeId(realNode.id);
    }
  });

  store.setUpdateEdgeChatEnabled((edgeId: string, chatEnabled: boolean) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data, chatEnabled } }
          : e
      )
    );
  });
}

async function fetchCanvas(
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void,
  setViewport: (vp: Viewport) => void,
  setLoaded: (v: boolean) => void,
) {
  try {
    const [nodesRes, edgesRes, canvasRes] = await Promise.all([
      fetch(`${API}/api/nodes`),
      fetch(`${API}/api/edges`),
      fetch(`${API}/api/canvas`),
    ]);
    if (!nodesRes.ok || !edgesRes.ok || !canvasRes.ok) {
      setLoaded(true);
      return;
    }
    const [nodesData, edgesData, canvasData] = await Promise.all([
      nodesRes.json(),
      edgesRes.json(),
      canvasRes.json(),
    ]);

    setNodes(
      nodesData.map((n: ApiNode) => mapApiNodeToFlowNode(n))
    );

    setEdges(
      edgesData.map((e: Record<string, unknown>) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: "smoothstep",
        sourceHandle: e.source_handle || undefined,
        targetHandle: e.target_handle || undefined,
        data: { chatEnabled: (e.chat_enabled as boolean) ?? false },
      }))
    );

    if (canvasData.viewport_x !== 0 || canvasData.viewport_y !== 0 || canvasData.zoom !== 1) {
      setViewport({ x: canvasData.viewport_x, y: canvasData.viewport_y, zoom: canvasData.zoom });
    }
    setLoaded(true);
  } catch (error) {
    console.error('Failed to fetch initial canvas data (nodes/edges/viewport):', error);
    setLoaded(true);
  }
}

export interface UseCanvasSyncOptions {
  onDragToEmpty?: (sourceNodeId: string, sourceHandleId: string, screenPosition: { x: number; y: number }) => void;
}

export function useCanvasSync(options?: UseCanvasSyncOptions) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  const { setViewport } = useReactFlow();
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectStartRef = useRef<{ nodeId: string; handleId: string } | null>(null);
  const onDragToEmptyRef = useRef(options?.onDragToEmpty);
  onDragToEmptyRef.current = options?.onDragToEmpty;

  useEffect(() => {
    useCanvasStore.getState().setApi(API);
    wireStoreActions(setNodes, setEdges);
    fetchCanvas(setNodes, setEdges, setViewport, setLoaded);

    // SSE stream for real-time node state updates
    const es = new EventSource(`${API}/api/events/stream`);
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const store = useCanvasStore.getState();
        switch (msg.event) {
          case "gauge":
            store.updateNodeGauge(msg.node_id, msg.gauge_value ?? null, msg.gauge_label, msg.gauge_unit);
            break;
          case "agent_status":
            store.updateNodeAgentStatus(msg.node_id, msg.agent_status, msg.agent_status_message);
            break;
          case "identity_update":
            if (msg.identity) store.updateNodeIdentity(msg.node_id, msg.identity);
            break;
          case "rename":
            store.updateNodeName(msg.node_id, msg.name);
            break;
          case "container_status":
            setNodes((nds) =>
              nds.map((n) =>
                n.id === msg.node_id
                  ? { ...n, data: { ...n.data, containerStatus: msg.container_status } }
                  : n
              )
            );
            break;
          case "node_archived":
            store.setNodeArchived(msg.node_id, true, msg.container_status);
            break;
          case "node_resumed":
            store.setNodeArchived(msg.node_id, false, msg.container_status);
            break;
          case "edge_chat_toggled":
            store.updateEdgeChatEnabled(msg.edge_id, msg.chat_enabled);
            break;
        }
      } catch (error) {
        console.warn('Failed to parse SSE canvas event:', error);
      }
    };

    // Fallback poll for resilience (covers SSE reconnection gaps)
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/nodes`);
        if (!res.ok) return;
        const nodesData: ApiNode[] = await res.json();
        const dataMap = new Map(nodesData.map((n) => [n.id, n]));
        setNodes((nds) =>
          nds.map((node) => {
            const fresh = dataMap.get(node.id);
            if (!fresh) return node;
            const freshData = mapApiNodeToNodeData(fresh);
            return {
              ...node,
              data: {
                ...node.data,
                containerStatus: freshData.containerStatus,
                archived: freshData.archived,
                identity: freshData.identity,
                agentStatus: freshData.agentStatus,
                agentStatusMessage: freshData.agentStatusMessage,
                gaugeValue: freshData.gaugeValue,
                gaugeLabel: freshData.gaugeLabel,
                gaugeUnit: freshData.gaugeUnit,
              },
            };
          })
        );
      } catch (error) {
        console.warn('Failed to poll node status updates:', error);
      }
    }, 60000);
    return () => {
      es.close();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveViewport = useCallback((viewport: Viewport) => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      fetch(`${API}/api/canvas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewport_x: viewport.x, viewport_y: viewport.y, zoom: viewport.zoom }),
      }).catch((error) => {
        console.warn('Failed to save viewport position:', error);
      });
    }, 500);
  }, []);

  const onConnect = useCallback(
    async (connection: Connection) => {
      const res = await fetch(`${API}/api/edges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: connection.source, target_id: connection.target, source_handle: connection.sourceHandle, target_handle: connection.targetHandle }),
      });
      if (!res.ok) return;
      const edge = await res.json();
      setEdges((eds) => addEdge({ ...connection, id: edge.id }, eds));
    },
    [setEdges]
  );

  const onConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
      if (params.nodeId && params.handleId) {
        connectStartRef.current = { nodeId: params.nodeId, handleId: params.handleId };
      }
    },
    []
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      const startInfo = connectStartRef.current;
      connectStartRef.current = null;
      if (!startInfo) return;

      // If the connection ended within snap radius of a handle, it's a real
      // connection (onConnect handles it) — don't trigger drag-to-create
      if (connectionState.toHandle) return;

      const clientX = "changedTouches" in event ? event.changedTouches[0].clientX : (event as MouseEvent).clientX;
      const clientY = "changedTouches" in event ? event.changedTouches[0].clientY : (event as MouseEvent).clientY;

      onDragToEmptyRef.current?.(startInfo.nodeId, startInfo.handleId, { x: clientX, y: clientY });
    },
    []
  );

  const onNodeDragStop = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      if (!node) return;
      fetch(`${API}/api/nodes/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position_x: node.position.x, position_y: node.position.y }),
      }).catch((error) => {
        console.warn(`Failed to save node position for ${node.id}:`, error);
      });
    },
    []
  );

  return { nodes, edges, loaded, onNodesChange, onEdgesChange, onConnect, onConnectStart, onConnectEnd, onNodeDragStop, saveViewport, setNodes, setEdges };
}
