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
} from "@xyflow/react";
import { useCanvasStore } from "@/store/canvasStore";
import { API_URL as API } from "@/lib/api";
import type { NanobotNodeData, NodeIdentity } from "@/types";

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
    fetch(`${API}/api/edges/${edgeId}`, { method: "DELETE" }).catch(() => {});
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

  store.setUpdateNodeGauge((nodeId: string, value: number | null, label?: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, gaugeValue: value, gaugeLabel: label || null } }
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
      nodesData.map((n: Record<string, unknown>) => ({
        id: n.id,
        type: "nanobot" as const,
        position: { x: n.position_x, y: n.position_y },
        data: {
          label: n.name as string,
          nodeId: n.id as string,
          containerStatus: (n.container_status as string) || null,
          identity: (n.identity as NodeIdentity) || null,
          agentStatus: (n.agent_status as string) || null,
          agentStatusMessage: (n.agent_status_message as string) || null,
          gaugeValue: (n.gauge_value as number) ?? null,
          gaugeLabel: (n.gauge_label as string) || null,
        } satisfies NanobotNodeData,
        style: { width: 80, height: 92 },
      }))
    );

    setEdges(
      edgesData.map((e: Record<string, unknown>) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: "smoothstep",
        sourceHandle: e.source_handle || undefined,
        targetHandle: e.target_handle || undefined,
      }))
    );

    if (canvasData.viewport_x !== 0 || canvasData.viewport_y !== 0 || canvasData.zoom !== 1) {
      setViewport({ x: canvasData.viewport_x, y: canvasData.viewport_y, zoom: canvasData.zoom });
    }
    setLoaded(true);
  } catch {
    setLoaded(true);
  }
}

export function useCanvasSync() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  const { setViewport } = useReactFlow();
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    useCanvasStore.getState().setApi(API);
    wireStoreActions(setNodes, setEdges);
    fetchCanvas(setNodes, setEdges, setViewport, setLoaded);

    // Periodically refresh node data (gauge, identity, status) from backend
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/nodes`);
        if (!res.ok) return;
        const nodesData: Record<string, unknown>[] = await res.json();
        const dataMap = new Map(nodesData.map((n) => [n.id as string, n]));
        setNodes((nds) =>
          nds.map((node) => {
            const fresh = dataMap.get(node.id);
            if (!fresh) return node;
            return {
              ...node,
              data: {
                ...node.data,
                containerStatus: fresh.container_status,
                identity: fresh.identity || null,
                agentStatus: fresh.agent_status || null,
                agentStatusMessage: fresh.agent_status_message || null,
                gaugeValue: (fresh.gauge_value as number) ?? null,
                gaugeLabel: (fresh.gauge_label as string) || null,
              },
            };
          })
        );
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveViewport = useCallback((viewport: Viewport) => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      fetch(`${API}/api/canvas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewport_x: viewport.x, viewport_y: viewport.y, zoom: viewport.zoom }),
      }).catch(() => {});
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

  const onNodeDragStop = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      fetch(`${API}/api/nodes/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position_x: node.position.x, position_y: node.position.y }),
      }).catch(() => {});
    },
    []
  );

  return { nodes, edges, loaded, onNodesChange, onEdgesChange, onConnect, onNodeDragStop, saveViewport, setNodes };
}
