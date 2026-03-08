import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAreaStore } from "@/store/areaStore";

describe("areaStore", () => {
  beforeEach(() => {
    // Reset store
    useAreaStore.setState({ areas: [], activeAreaId: null, loaded: false });
  });

  it("initializes with empty areas", () => {
    const state = useAreaStore.getState();
    expect(state.areas).toEqual([]);
    expect(state.activeAreaId).toBeNull();
    expect(state.loaded).toBe(false);
  });

  it("setAreas sets areas and selects first", () => {
    const areas = [
      { id: "a1", name: "Main", sort_order: 0, node_count: 2 },
      { id: "a2", name: "Dev", sort_order: 1, node_count: 0 },
    ];
    useAreaStore.getState().setAreas(areas);
    const state = useAreaStore.getState();
    expect(state.areas).toEqual(areas);
    expect(state.activeAreaId).toBe("a1");
    expect(state.loaded).toBe(true);
  });

  it("setActiveAreaId updates active area", () => {
    useAreaStore.getState().setAreas([
      { id: "a1", name: "Main", sort_order: 0, node_count: 0 },
    ]);
    useAreaStore.getState().setActiveAreaId("a1");
    expect(useAreaStore.getState().activeAreaId).toBe("a1");
  });

  it("addArea appends to areas list", () => {
    useAreaStore.getState().setAreas([
      { id: "a1", name: "Main", sort_order: 0, node_count: 0 },
    ]);
    useAreaStore.getState().addArea({ id: "a2", name: "New", sort_order: 1, node_count: 0 });
    expect(useAreaStore.getState().areas).toHaveLength(2);
    expect(useAreaStore.getState().areas[1].name).toBe("New");
  });

  it("updateArea patches area properties", () => {
    useAreaStore.getState().setAreas([
      { id: "a1", name: "Main", sort_order: 0, node_count: 0 },
    ]);
    useAreaStore.getState().updateArea("a1", { name: "Renamed" });
    expect(useAreaStore.getState().areas[0].name).toBe("Renamed");
  });

  it("removeArea removes area and switches active if needed", () => {
    useAreaStore.getState().setAreas([
      { id: "a1", name: "Main", sort_order: 0, node_count: 0 },
      { id: "a2", name: "Dev", sort_order: 1, node_count: 0 },
    ]);
    useAreaStore.getState().setActiveAreaId("a1");
    useAreaStore.getState().removeArea("a1");
    expect(useAreaStore.getState().areas).toHaveLength(1);
    expect(useAreaStore.getState().activeAreaId).toBe("a2");
  });

  it("removeArea keeps activeAreaId when removing non-active", () => {
    useAreaStore.getState().setAreas([
      { id: "a1", name: "Main", sort_order: 0, node_count: 0 },
      { id: "a2", name: "Dev", sort_order: 1, node_count: 0 },
    ]);
    useAreaStore.getState().setActiveAreaId("a1");
    useAreaStore.getState().removeArea("a2");
    expect(useAreaStore.getState().areas).toHaveLength(1);
    expect(useAreaStore.getState().activeAreaId).toBe("a1");
  });
});
