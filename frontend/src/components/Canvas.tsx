"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { NanobotNode } from "./NanobotNode";
import { DeletableEdge } from "./DeletableEdge";
import { DefaultConfigPanel } from "./DefaultConfigPanel";
import { GenesisModal } from "./GenesisModal";
import { CanvasToolbar } from "./CanvasToolbar";
import { NodeDrawer } from "./NodeDrawer";
import { ContextMenu } from "./ContextMenu";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { EventLogDrawer } from "./EventLogDrawer";
import { TreeViewDrawer } from "./TreeViewDrawer";
import { useCanvasStore } from "@/store/canvasStore";
import { useCanvasSync } from "@/hooks/useCanvasSync";
import { useEventLogStore } from "@/store/eventLogStore";
import { generateBotName } from "@/lib/names";
import type { NanobotNodeData } from "@/types";

const nodeTypes = { nanobot: NanobotNode };
const edgeTypes = { smoothstep: DeletableEdge };

function CanvasInner() {
  const { nodes, edges, loaded, onNodesChange, onEdgesChange, onConnect, onNodeDragStop, saveViewport, setNodes } = useCanvasSync();
  const [showSettings, setShowSettings] = useState(false);
  const [showGenesis, setShowGenesis] = useState(false);
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ nodeId: string; label: string } | null>(null);
  const createAtRef = useRef<{ x: number; y: number } | null>(null);
  const api = useCanvasStore((s) => s.api);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);
  const { screenToFlowPosition, setCenter } = useReactFlow();

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const selectedNodeData = selectedNode?.data as NanobotNodeData | undefined;

  // Start event log polling once the API URL is known
  useEffect(() => {
    if (api) {
      useEventLogStore.getState().startPolling(api);
    }
    return () => { useEventLogStore.getState().stopPolling(); };
  }, [api]);

  const handleFocusNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setSelectedNodeId(nodeId);
    setShowSettings(false);
    // Center on node (nodes are 80x92, offset to center)
    setCenter(node.position.x + 40, node.position.y + 46, { zoom: 1.5, duration: 400 });
  }, [nodes, setSelectedNodeId, setCenter]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setContextMenu(null);
  }, [setSelectedNodeId]);

  const handleNodeClick = useCallback(() => {
    setShowSettings(false);
    setContextMenu(null);
  }, []);

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: { id: string }) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);

  const handlePaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleContextMenuClose = useCallback(() => setContextMenu(null), []);

  const handleContextMenuDelete = useCallback(() => {
    if (!contextMenu?.nodeId) return;
    const node = nodes.find((n) => n.id === contextMenu.nodeId);
    const label = (node?.data as NanobotNodeData | undefined)?.label || "";
    setDeleteConfirm({ nodeId: contextMenu.nodeId, label });
    setContextMenu(null);
  }, [contextMenu, nodes]);

  const handleContextMenuAddBot = useCallback(() => {
    if (contextMenu) {
      createAtRef.current = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y });
    }
    setContextMenu(null);
    setShowGenesis(true);
  }, [contextMenu, screenToFlowPosition]);

  const handleToggleSettings = useCallback(() => {
    setShowSettings((v) => {
      if (!v) setSelectedNodeId(null);
      return !v;
    });
  }, [setSelectedNodeId]);

  const handleGenesis = useCallback(async (genesisPrompt: string | null) => {
    setShowGenesis(false);
    const name = generateBotName();
    const pos = createAtRef.current || { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 };
    createAtRef.current = null;
    const res = await fetch(`${api}/api/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, position_x: pos.x, position_y: pos.y }),
    });
    if (!res.ok) return;
    const node = await res.json();
    const hasGenesis = !!genesisPrompt;
    setNodes((nds) => [
      ...nds,
      {
        id: node.id,
        type: "nanobot" as const,
        position: { x: node.position_x, y: node.position_y },
        data: {
          label: node.name,
          nodeId: node.id,
          containerStatus: node.container_status,
          genesisPrompt: genesisPrompt || undefined,
          genesisActive: hasGenesis,
          identity: null,
        },
        style: { width: 80, height: 92 },
      },
    ]);
    if (hasGenesis) {
      setSelectedNodeId(node.id);
      setShowSettings(false);
    }
  }, [api, setNodes, setSelectedNodeId]);

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", zIndex: 100, fontSize: 16, color: "var(--text-muted)" }}>
          Loading Paradise...
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1000, width: "100%", height: "100%" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onViewportChange={saveViewport}
          onPaneClick={handlePaneClick}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          snapToGrid
          snapGrid={[20, 20]}
          fitView={!loaded}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "var(--border)", strokeWidth: 1.5 }, animated: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="var(--dots)" gap={20} />
          <Controls style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 }} />
          <MiniMap style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 }} nodeColor="var(--accent)" maskColor="rgba(0,0,0,0.5)" />
        </ReactFlow>
      </div>

      <CanvasToolbar showSettings={showSettings} onToggleSettings={handleToggleSettings} onAddBot={() => setShowGenesis(true)} />

      {showSettings && <DefaultConfigPanel api={api} onClose={() => setShowSettings(false)} />}
      {selectedNodeData && (
        <NodeDrawer data={selectedNodeData} onClose={() => setSelectedNodeId(null)} />
      )}
      {showGenesis && <GenesisModal onClose={() => { setShowGenesis(false); createAtRef.current = null; }} onCreate={handleGenesis} />}

      {contextMenu && (
        <ContextMenu
          position={contextMenu}
          nodeId={contextMenu.nodeId}
          onClose={handleContextMenuClose}
          onDelete={handleContextMenuDelete}
          onAddBot={handleContextMenuAddBot}
        />
      )}
      {deleteConfirm && (
        <DeleteConfirmModal
          nodeId={deleteConfirm.nodeId}
          label={deleteConfirm.label}
          onClose={() => setDeleteConfirm(null)}
        />
      )}

      <TreeViewDrawer nodes={nodes} edges={edges} onFocusNode={handleFocusNode} onOpenChange={setTreeDrawerOpen} />
      <EventLogDrawer drawerOpen={!!selectedNodeData} treeDrawerOpen={treeDrawerOpen} onFocusNode={handleFocusNode} />

      <div style={{ position: "fixed", top: 16, left: 16, fontSize: 18, fontWeight: 700, color: "var(--text)", opacity: 0.4, zIndex: 1000, pointerEvents: "none", letterSpacing: 2 }}>
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
