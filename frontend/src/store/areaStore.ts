import { create } from "zustand";

export interface Area {
  id: string;
  name: string;
  sort_order: number;
  node_count: number;
  has_pin: boolean;
}

interface AreaStore {
  areas: Area[];
  activeAreaId: string | null;
  loaded: boolean;
  setAreas: (areas: Area[]) => void;
  setActiveAreaId: (id: string) => void;
  addArea: (area: Area) => void;
  updateArea: (id: string, patch: Partial<Area>) => void;
  removeArea: (id: string) => void;
}

const STORAGE_KEY = "paradise-active-area";

export const useAreaStore = create<AreaStore>((set, get) => ({
  areas: [],
  activeAreaId: null,
  loaded: false,

  setAreas: (areas) => {
    const current = get().activeAreaId;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {}
    const preferred = current || saved;
    const activeAreaId =
      preferred && areas.some((a) => a.id === preferred)
        ? preferred
        : areas[0]?.id || null;
    set({ areas, loaded: true, activeAreaId });
  },

  setActiveAreaId: (id) => {
    set({ activeAreaId: id });
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  },

  addArea: (area) =>
    set((s) => ({ areas: [...s.areas, area] })),

  updateArea: (id, patch) =>
    set((s) => ({
      areas: s.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  removeArea: (id) =>
    set((s) => {
      const filtered = s.areas.filter((a) => a.id !== id);
      return {
        areas: filtered,
        activeAreaId:
          s.activeAreaId === id ? filtered[0]?.id || null : s.activeAreaId,
      };
    }),
}));
