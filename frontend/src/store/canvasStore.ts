import { create } from "zustand";

interface CanvasStore {
  api: string;
  setApi: (url: string) => void;
  toggleExpanded: (nodeId: string) => void;
  setToggleExpanded: (fn: (nodeId: string) => void) => void;
  removeNode: (nodeId: string) => void;
  setRemoveNode: (fn: (nodeId: string) => void) => void;
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  api: "",
  setApi: (url) => set({ api: url }),
  toggleExpanded: () => {},
  setToggleExpanded: (fn) => set({ toggleExpanded: fn }),
  removeNode: () => {},
  setRemoveNode: (fn) => set({ removeNode: fn }),
}));
