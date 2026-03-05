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
import { GenesisModal, type GenesisResult } from "./GenesisModal";
import { CanvasToolbar } from "./CanvasToolbar";
import { NodeDrawer } from "./NodeDrawer";
import { ContextMenu } from "./ContextMenu";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { EventLogDrawer } from "./EventLogDrawer";
import { TreeViewDrawer } from "./TreeViewDrawer";
import { useCanvasStore } from "@/store/canvasStore";
import { useCanvasSync } from "@/hooks/useCanvasSync";
import { useEventLogStore } from "@/store/eventLogStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { generateBotName } from "@/lib/names";
import type { NanobotNodeData, Recommendation } from "@/types";
import { mapApiNodeToFlowNode, mapApiNodeToNodeData, createPlaceholderFlowNode } from "@/lib/mappers";
import { MobileLayout } from "./MobileLayout";

let placeholderSeq = 0;
function makeTempId(prefix = "placeholder") {
  return `${prefix}-${++placeholderSeq}-${Date.now()}`;
}

const nodeTypes = { nanobot: NanobotNode };
const edgeTypes = { smoothstep: DeletableEdge };

function computeTargetHandle(sourceHandle: string): string {
  switch (sourceHandle) {
    case "bottom-s": return "top-t";
    case "top-s": return "bottom-t";
    case "left-s": return "right-t";
    case "right-s": return "left-t";
    default: return "top-t";
  }
}

interface DragCreateContext {
  parentNodeId: string;
  parentNodeName: string;
  sourceHandle: string;
  dropPosition: { x: number; y: number };
  recommendations: Recommendation[];
}

function CanvasInner() {
  const [showSettings, setShowSettings] = useState(false);
  const [showGenesis, setShowGenesis] = useState(false);
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ nodeId: string; label: string } | null>(null);
  const [dragCreateContext, setDragCreateContext] = useState<DragCreateContext | null>(null);
  const createAtRef = useRef<{ x: number; y: number } | null>(null);
  const isMobile = useIsMobile();
  const api = useCanvasStore((s) => s.api);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((s) => s.setSelectedNodeId);
  const { screenToFlowPosition, setCenter } = useReactFlow();

  // Ref-stabilized callback for useCanvasSync to avoid circular dependency
  const handleDragToEmptyRef = useRef<((sourceNodeId: string, sourceHandleId: string, screenPosition: { x: number; y: number }) => void) | undefined>(undefined);

  const { nodes, edges, loaded, onNodesChange, onEdgesChange, onConnect, onConnectStart, onConnectEnd, onNodeDragStop, saveViewport, setNodes, setEdges } =
    useCanvasSync({ onDragToEmpty: (...args) => handleDragToEmptyRef.current?.(...args) });

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const selectedNodeData = selectedNode?.data as NanobotNodeData | undefined;

  // Implement the drag-to-empty handler
  handleDragToEmptyRef.current = useCallback(
    (sourceNodeId: string, sourceHandleId: string, screenPosition: { x: number; y: number }) => {
      // Only trigger from source handles
      if (!sourceHandleId.endsWith("-s")) return;

      const flowPosition = screenToFlowPosition({ x: screenPosition.x, y: screenPosition.y });
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      const parentName = (sourceNode?.data as NanobotNodeData)?.label || "Unknown";

      // Open genesis modal immediately with empty recommendations
      setDragCreateContext({
        parentNodeId: sourceNodeId,
        parentNodeName: parentName,
        sourceHandle: sourceHandleId,
        dropPosition: flowPosition,
        recommendations: [],
      });
      setShowGenesis(true);

      // Fetch recommendations asynchronously
      if (api) {
        fetch(`${api}/api/nodes/${sourceNodeId}/recommendations`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.recommendations) {
              setDragCreateContext((prev) =>
                prev && prev.parentNodeId === sourceNodeId
                  ? { ...prev, recommendations: data.recommendations }
                  : prev
              );
            }
          })
          .catch((error) => {
            console.warn(`Failed to fetch recommendations for node ${sourceNodeId}:`, error);
          });
      }
    },
    [api, nodes, screenToFlowPosition]
  );

  // Start event log polling once the API URL is known (skip on mobile)
  useEffect(() => {
    if (api && !isMobile) {
      useEventLogStore.getState().startPolling(api);
    }
    return () => { useEventLogStore.getState().stopPolling(); };
  }, [api, isMobile]);

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

  const handleTreeNodeContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
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

  const handleGenesis = useCallback(async (result: GenesisResult) => {
    setShowGenesis(false);

    if (dragCreateContext) {
      // --- CHILD CREATION PATH ---
      const { parentNodeId, sourceHandle, dropPosition } = dragCreateContext;
      const rec = result.recommendation;
      const name = rec?.name || generateBotName();
      const genesisPrompt = result.genesisPrompt || name;
      const targetHandle = computeTargetHandle(sourceHandle);

      setDragCreateContext(null);

      // Immediately add placeholder node + edge
      const tempId = makeTempId("placeholder");
      const tempEdgeId = makeTempId("placeholder-edge");
      setNodes((nds) => [...nds, createPlaceholderFlowNode(tempId, name, dropPosition)]);
      useCanvasStore.getState().addEdge({
        id: tempEdgeId,
        source: parentNodeId,
        target: tempId,
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
      });

      const res = await fetch(`${api}/api/nodes/${parentNodeId}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          genesis_prompt: genesisPrompt,
          icon: rec?.icon || undefined,
          emoji: rec?.emoji || undefined,
          description: rec?.description || undefined,
          position_x: dropPosition.x,
          position_y: dropPosition.y,
          source_handle: sourceHandle,
          target_handle: targetHandle,
        }),
      });

      if (!res.ok) {
        useCanvasStore.getState().removeNode(tempId);
        return;
      }

      const data = await res.json();
      const n = data.node;

      // Replace placeholder with real node (also updates edge source/target refs)
      useCanvasStore.getState().replaceNode(tempId, {
        id: n.id,
        position: { x: n.position_x, y: n.position_y },
        data: mapApiNodeToNodeData(n, {
          genesisPrompt: data.genesis_prompt,
          genesisActive: true,
        }),
      });

      // Update edge ID from placeholder to real
      setEdges((eds) =>
        eds.map((e) => e.id === tempEdgeId ? { ...e, id: String(data.edge_id) } : e)
      );

      setSelectedNodeId(n.id);
      setShowSettings(false);
    } else {
      // --- ROOT CREATION PATH ---
      const name = generateBotName();
      const genesisPrompt = result.genesisPrompt;
      const pos = createAtRef.current || { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 };
      createAtRef.current = null;

      // Immediately add placeholder node
      const tempId = makeTempId("placeholder");
      setNodes((nds) => [...nds, createPlaceholderFlowNode(tempId, name, pos)]);

      const res = await fetch(`${api}/api/nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, position_x: pos.x, position_y: pos.y }),
      });

      if (!res.ok) {
        useCanvasStore.getState().removeNode(tempId);
        return;
      }

      const node = await res.json();
      const hasGenesis = !!genesisPrompt;

      // Replace placeholder with real node
      useCanvasStore.getState().replaceNode(tempId, {
        id: node.id,
        position: { x: node.position_x, y: node.position_y },
        data: mapApiNodeToNodeData(node, {
          genesisPrompt: genesisPrompt || undefined,
          genesisActive: hasGenesis,
        }),
      });

      if (hasGenesis) {
        setSelectedNodeId(node.id);
        setShowSettings(false);
      }
    }
  }, [api, dragCreateContext, setNodes, setEdges, setSelectedNodeId]);

  // ─── Mobile layout ───
  if (isMobile) {
    return (
      <>
        <MobileLayout
          nodes={nodes}
          edges={edges}
          selectedNodeData={selectedNodeData}
          onSelectNode={(nodeId) => { setSelectedNodeId(nodeId); setShowSettings(false); }}
          onDeselectNode={() => setSelectedNodeId(null)}
          showSettings={showSettings}
          onToggleSettings={handleToggleSettings}
          onAddBot={() => setShowGenesis(true)}
          api={api}
          showGenesis={showGenesis}
          onCloseGenesis={() => { setShowGenesis(false); setDragCreateContext(null); }}
          onGenesis={handleGenesis}
          parentContext={
            dragCreateContext
              ? {
                  nodeId: dragCreateContext.parentNodeId,
                  nodeName: dragCreateContext.parentNodeName,
                  recommendations: dragCreateContext.recommendations,
                }
              : undefined
          }
          loaded={loaded}
          onNodeContextMenu={handleTreeNodeContextMenu}
        />
        {contextMenu && (
          <ContextMenu
            position={contextMenu}
            nodeId={contextMenu.nodeId}
            rebuilding={
              contextMenu.nodeId
                ? !!(nodes.find((n) => n.id === contextMenu.nodeId)?.data as NanobotNodeData | undefined)?.rebuilding
                : false
            }
            archived={
              contextMenu.nodeId
                ? !!(nodes.find((n) => n.id === contextMenu.nodeId)?.data as NanobotNodeData | undefined)?.archived
                : false
            }
            shortcuts={
              contextMenu.nodeId
                ? (nodes.find((n) => n.id === contextMenu.nodeId)?.data as NanobotNodeData | undefined)?.identity?.shortcuts
                : undefined
            }
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
      </>
    );
  }

  // ─── Desktop layout ───
  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", zIndex: 100, fontSize: 16, color: "var(--text-muted)" }}>
          Loading Paradise...
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
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
        <MiniMap style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 }} nodeColor="var(--accent)" maskColor="var(--shadow-md)" />
      </ReactFlow>

      <CanvasToolbar showSettings={showSettings} onToggleSettings={handleToggleSettings} onAddBot={() => setShowGenesis(true)} />

      {showSettings && <DefaultConfigPanel api={api} onClose={() => setShowSettings(false)} />}
      {selectedNodeData && (
        <NodeDrawer data={selectedNodeData} onClose={() => setSelectedNodeId(null)} />
      )}
      {showGenesis && (
        <GenesisModal
          onClose={() => {
            setShowGenesis(false);
            createAtRef.current = null;
            setDragCreateContext(null);
          }}
          onCreate={handleGenesis}
          parentContext={
            dragCreateContext
              ? {
                  nodeId: dragCreateContext.parentNodeId,
                  nodeName: dragCreateContext.parentNodeName,
                  recommendations: dragCreateContext.recommendations,
                }
              : undefined
          }
        />
      )}

      {contextMenu && (
        <ContextMenu
          position={contextMenu}
          nodeId={contextMenu.nodeId}
          rebuilding={
            contextMenu.nodeId
              ? !!(nodes.find((n) => n.id === contextMenu.nodeId)?.data as NanobotNodeData | undefined)?.rebuilding
              : false
          }
          archived={
            contextMenu.nodeId
              ? !!(nodes.find((n) => n.id === contextMenu.nodeId)?.data as NanobotNodeData | undefined)?.archived
              : false
          }
          shortcuts={
            contextMenu.nodeId
              ? (nodes.find((n) => n.id === contextMenu.nodeId)?.data as NanobotNodeData | undefined)?.identity?.shortcuts
              : undefined
          }
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

      <TreeViewDrawer nodes={nodes} edges={edges} onFocusNode={handleFocusNode} onOpenChange={setTreeDrawerOpen} onNodeContextMenu={handleTreeNodeContextMenu} />
      <EventLogDrawer drawerOpen={!!selectedNodeData || showSettings} treeDrawerOpen={treeDrawerOpen} onFocusNode={handleFocusNode} />

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
