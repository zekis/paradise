import { create } from "zustand";
import type { NodeIdentity } from "@/types";

interface CanvasStore {
  api: string;
  setApi: (url: string) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  removeNode: (nodeId: string) => void;
  setRemoveNode: (fn: (nodeId: string) => void) => void;
  removeEdge: (edgeId: string) => void;
  setRemoveEdge: (fn: (edgeId: string) => void) => void;
  updateNodeIdentity: (nodeId: string, identity: NodeIdentity) => void;
  setUpdateNodeIdentity: (fn: (nodeId: string, identity: NodeIdentity) => void) => void;
  updateNodeName: (nodeId: string, name: string) => void;
  setUpdateNodeName: (fn: (nodeId: string, name: string) => void) => void;
  updateNodeAgentStatus: (nodeId: string, status: string | null, message?: string) => void;
  setUpdateNodeAgentStatus: (fn: (nodeId: string, status: string | null, message?: string) => void) => void;
  updateNodeGauge: (nodeId: string, value: number | null, label?: string) => void;
  setUpdateNodeGauge: (fn: (nodeId: string, value: number | null, label?: string) => void) => void;
  addNode: (node: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }) => void;
  setAddNode: (fn: (node: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }) => void) => void;
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  api: "",
  setApi: (url) => set({ api: url }),
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  removeNode: () => {},
  setRemoveNode: (fn) => set({ removeNode: fn }),
  removeEdge: () => {},
  setRemoveEdge: (fn) => set({ removeEdge: fn }),
  updateNodeIdentity: () => {},
  setUpdateNodeIdentity: (fn) => set({ updateNodeIdentity: fn }),
  updateNodeName: () => {},
  setUpdateNodeName: (fn) => set({ updateNodeName: fn }),
  updateNodeAgentStatus: () => {},
  setUpdateNodeAgentStatus: (fn) => set({ updateNodeAgentStatus: fn }),
  updateNodeGauge: () => {},
  setUpdateNodeGauge: (fn) => set({ updateNodeGauge: fn }),
  addNode: () => {},
  setAddNode: (fn) => set({ addNode: fn }),
}));
