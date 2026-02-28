"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
  type Viewport,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Connection,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@mdi/react";
import { mdiCog, mdiPlus } from "@mdi/js";
import { NanobotNode } from "./NanobotNode";
import { DefaultConfigPanel } from "./DefaultConfigPanel";
import { GenesisModal } from "./GenesisModal";
import { useCanvasStore } from "@/store/canvasStore";

const nodeTypes = {
  nanobot: NanobotNode,
};

function getApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}
const API = getApiUrl();

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGenesis, setShowGenesis] = useState(false);
  const { setApi, setToggleExpanded, setRemoveNode, setUpdateNodeIdentity, setUpdateNodeName, setUpdateNodeAgentStatus, setAddNode } = useCanvasStore();
  const { setViewport } = useReactFlow();
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setApi(API);
    setToggleExpanded((nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const wasExpanded = n.data.expanded;
          if (wasExpanded) {
            // Collapsing: restore home position
            return {
              ...n,
              position: {
                x: n.data.homeX ?? n.position.x,
                y: n.data.homeY ?? n.position.y,
              },
              data: { ...n.data, expanded: false, homeX: undefined, homeY: undefined },
              style: {
                ...n.style,
                width: 80,
                height: 92,
                transition: "width 0.2s ease, height 0.2s ease",
              },
            };
          } else {
            // Expanding: save current position as home
            return {
              ...n,
              data: { ...n.data, expanded: true, homeX: n.position.x, homeY: n.position.y },
              style: {
                ...n.style,
                width: 320,
                height: 380,
                transition: "width 0.2s ease, height 0.2s ease",
              },
            };
          }
        })
      );
    });
    setRemoveNode((nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    });
    setUpdateNodeIdentity((nodeId: string, identity: any) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, identity, genesisActive: false, genesisPrompt: undefined } }
            : n
        )
      );
    });
    setUpdateNodeName((nodeId: string, name: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, label: name } }
            : n
        )
      );
    });
    setUpdateNodeAgentStatus((nodeId: string, status: string | null, message?: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, agentStatus: status, agentStatusMessage: message } }
            : n
        )
      );
    });
    setAddNode((node: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }) => {
      setNodes((nds) => [
        ...nds,
        {
          id: node.id,
          type: "nanobot",
          position: node.position,
          data: node.data,
          style: { width: 80, height: 92 },
        },
      ]);
    });
    loadCanvas();
  }, []);

  async function loadCanvas() {
    try {
      const [nodesRes, edgesRes, canvasRes] = await Promise.all([
        fetch(`${API}/api/nodes`),
        fetch(`${API}/api/edges`),
        fetch(`${API}/api/canvas`),
      ]);
      const nodesData = await nodesRes.json();
      const edgesData = await edgesRes.json();
      const canvasData = await canvasRes.json();

      const flowNodes: Node[] = nodesData.map((n: any) => ({
        id: n.id,
        type: "nanobot",
        position: { x: n.position_x, y: n.position_y },
        data: {
          label: n.name,
          nodeId: n.id,
          containerStatus: n.container_status,
          expanded: false,
          identity: n.identity || null,
          agentStatus: n.agent_status || null,
          agentStatusMessage: n.agent_status_message || null,
        },
        style: { width: 80, height: 92 },
      }));

      const flowEdges: Edge[] = edgesData.map((e: any) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: "default",
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);

      // Restore viewport
      if (canvasData.viewport_x !== 0 || canvasData.viewport_y !== 0 || canvasData.zoom !== 1) {
        setViewport({
          x: canvasData.viewport_x,
          y: canvasData.viewport_y,
          zoom: canvasData.zoom,
        });
      }
      setLoaded(true);
    } catch (err) {
      console.error("Failed to load canvas:", err);
      setLoaded(true);
    }
  }

  const saveViewport = useCallback((viewport: Viewport) => {
    // Debounce viewport saves
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      fetch(`${API}/api/canvas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewport_x: viewport.x,
          viewport_y: viewport.y,
          zoom: viewport.zoom,
        }),
      }).catch(() => {});
    }, 500);
  }, []);

  const onConnect = useCallback(
    async (connection: Connection) => {
      try {
        const res = await fetch(`${API}/api/edges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_id: connection.source,
            target_id: connection.target,
          }),
        });
        const edge = await res.json();
        setEdges((eds) =>
          addEdge({ ...connection, id: edge.id }, eds)
        );
      } catch (err) {
        console.error("Failed to create edge:", err);
      }
    },
    [setEdges]
  );

  const onNodeDragStop = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      // Don't persist position changes when expanded — diagram layout stays fixed
      if (node.data.expanded) return;
      try {
        await fetch(`${API}/api/nodes/${node.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            position_x: node.position.x,
            position_y: node.position.y,
          }),
        });
      } catch (err) {
        console.error("Failed to save node position:", err);
      }
    },
    []
  );

  const handleGenesis = useCallback(async (genesisPrompt: string | null) => {
    setShowGenesis(false);

    const adj = ["swift","bright","silent","cosmic","neon","vivid","lucid","bold","keen","calm","wild","cool","warm","deft","sly","apt","zen","raw","odd","wry"];
    const noun = ["fox","owl","lynx","wolf","bear","hawk","pike","crab","moth","wasp","yak","eel","cod","ant","bat","ram","elk","jay","koi","pug"];
    const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    const name = `${pick(adj)}-${pick(noun)}-${Math.floor(Math.random() * 900 + 100)}`;

    try {
      const res = await fetch(`${API}/api/nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          position_x: Math.random() * 400 + 100,
          position_y: Math.random() * 400 + 100,
        }),
      });
      const node = await res.json();

      // If genesis prompt provided, create expanded with genesis data
      const hasGenesis = !!genesisPrompt;
      setNodes((nds) => [
        ...nds,
        {
          id: node.id,
          type: "nanobot",
          position: { x: node.position_x, y: node.position_y },
          data: {
            label: node.name,
            nodeId: node.id,
            containerStatus: node.container_status,
            expanded: hasGenesis,
            genesisPrompt: genesisPrompt || undefined,
            genesisActive: hasGenesis,
            identity: null,
            ...(hasGenesis ? { homeX: node.position_x, homeY: node.position_y } : {}),
          },
          style: hasGenesis
            ? { width: 320, height: 380 }
            : { width: 80, height: 92 },
        },
      ]);
    } catch (err) {
      console.error("Failed to create node:", err);
    }
  }, [setNodes]);

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      {/* Loading overlay */}
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
            zIndex: 100,
            fontSize: 16,
            color: "var(--text-muted)",
          }}
        >
          Loading Paradise...
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onViewportChange={saveViewport}
        nodeTypes={nodeTypes}
        snapToGrid
        snapGrid={[20, 20]}
        fitView={!loaded}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: "var(--border)", strokeWidth: 1.5 },
          animated: true,
        }}
      >
        <Background variant={BackgroundVariant.Dots} color="#222" gap={20} />
        <Controls
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        />
        <MiniMap
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
          nodeColor="var(--accent)"
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>

      {/* FAB buttons */}
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          display: "flex",
          gap: 10,
          alignItems: "center",
          zIndex: 1000,
        }}
      >
        <button
          onClick={() => setShowSettings((v) => !v)}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: showSettings ? "var(--accent)" : "var(--bg-card)",
            color: showSettings ? "#fff" : "var(--text-muted)",
            border: "1px solid var(--border)",
            fontSize: 18,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.2s, color 0.2s",
          }}
          title="Default Config"
        >
          <Icon path={mdiCog} size={0.9} />
        </button>
        <button
          onClick={() => setShowGenesis(true)}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
          title="Add Nanobot"
        >
          <Icon path={mdiPlus} size={1} />
        </button>
      </div>

      {/* Default config panel */}
      {showSettings && (
        <DefaultConfigPanel api={API} onClose={() => setShowSettings(false)} />
      )}

      {/* Genesis modal */}
      {showGenesis && (
        <GenesisModal
          onClose={() => setShowGenesis(false)}
          onCreate={handleGenesis}
        />
      )}

      {/* Title */}
      <div
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          fontSize: 18,
          fontWeight: 700,
          color: "var(--text)",
          opacity: 0.4,
          zIndex: 1000,
          pointerEvents: "none",
          letterSpacing: 2,
        }}
      >
        PARADISE
      </div>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
