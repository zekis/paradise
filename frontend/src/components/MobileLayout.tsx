"use client";

import type { Node, Edge } from "@xyflow/react";
import type { NanobotNodeData } from "@/types";
import { MobileTreeView } from "./MobileTreeView";
import { MobileToolbar } from "./MobileToolbar";
import { NodeDrawer } from "./NodeDrawer";
import { DefaultConfigPanel } from "./DefaultConfigPanel";
import { GenesisModal, type GenesisResult } from "./GenesisModal";

interface MobileLayoutProps {
  nodes: Node[];
  edges: Edge[];
  selectedNodeData: NanobotNodeData | undefined;
  onSelectNode: (nodeId: string) => void;
  onDeselectNode: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  onAddBot: () => void;
  api: string;
  showGenesis: boolean;
  onCloseGenesis: () => void;
  onGenesis: (result: GenesisResult) => void;
  parentContext?: {
    nodeId: string;
    nodeName: string;
    recommendations: import("@/types").Recommendation[];
  };
  loaded: boolean;
}

export function MobileLayout({
  nodes,
  edges,
  selectedNodeData,
  onSelectNode,
  onDeselectNode,
  showSettings,
  onToggleSettings,
  onAddBot,
  api,
  showGenesis,
  onCloseGenesis,
  onGenesis,
  parentContext,
  loaded,
}: MobileLayoutProps) {
  const showCard = !!selectedNodeData;

  return (
    <div style={{ width: "100%", height: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)", position: "relative" }}>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", zIndex: 100, fontSize: 16, color: "var(--text-muted)" }}>
          Loading Paradise...
        </div>
      )}

      <MobileToolbar
        showBack={showCard}
        onBack={onDeselectNode}
        showSettings={showSettings}
        onToggleSettings={onToggleSettings}
        onAddBot={onAddBot}
      />

      {showCard ? (
        <NodeDrawer data={selectedNodeData} onClose={onDeselectNode} isMobile />
      ) : (
        <MobileTreeView nodes={nodes} edges={edges} onSelectNode={onSelectNode} />
      )}

      {showSettings && <DefaultConfigPanel api={api} onClose={onToggleSettings} isMobile />}
      {showGenesis && (
        <GenesisModal
          onClose={onCloseGenesis}
          onCreate={onGenesis}
          parentContext={parentContext}
        />
      )}
    </div>
  );
}
