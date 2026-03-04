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
  updateNodeGauge: (nodeId: string, value: number | null, label?: string, unit?: string) => void;
  setUpdateNodeGauge: (fn: (nodeId: string, value: number | null, label?: string, unit?: string) => void) => void;
  addNode: (node: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }) => void;
  setAddNode: (fn: (node: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }) => void) => void;
  addEdge: (edge: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }) => void;
  setAddEdge: (fn: (edge: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }) => void) => void;
  setNodeRebuilding: (nodeId: string, rebuilding: boolean) => void;
  setSetNodeRebuilding: (fn: (nodeId: string, rebuilding: boolean) => void) => void;
  setNodeArchived: (nodeId: string, archived: boolean, containerStatus?: string) => void;
  setSetNodeArchived: (fn: (nodeId: string, archived: boolean, containerStatus?: string) => void) => void;
  replaceNode: (tempId: string, realNode: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }) => void;
  setReplaceNode: (fn: (tempId: string, realNode: { id: string; position: { x: number; y: number }; data: Record<string, unknown> }) => void) => void;
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
  addEdge: () => {},
  setAddEdge: (fn) => set({ addEdge: fn }),
  setNodeRebuilding: () => {},
  setSetNodeRebuilding: (fn) => set({ setNodeRebuilding: fn }),
  setNodeArchived: () => {},
  setSetNodeArchived: (fn) => set({ setNodeArchived: fn }),
  replaceNode: () => {},
  setReplaceNode: (fn) => set({ replaceNode: fn }),
}));
