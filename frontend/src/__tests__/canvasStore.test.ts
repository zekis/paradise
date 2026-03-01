import { describe, it, expect, vi } from "vitest";
import { useCanvasStore } from "@/store/canvasStore";
import { TEST_API } from "./test-utils";

describe("canvasStore", () => {
  it("initializes with empty api", () => {
    const state = useCanvasStore.getState();
    expect(state.api).toBe("");
  });

  it("sets api url", () => {
    useCanvasStore.getState().setApi(TEST_API);
    expect(useCanvasStore.getState().api).toBe(TEST_API);
  });

  it("initializes with null selectedNodeId", () => {
    expect(useCanvasStore.getState().selectedNodeId).toBeNull();
  });

  it("sets and clears selectedNodeId", () => {
    useCanvasStore.getState().setSelectedNodeId("node-123");
    expect(useCanvasStore.getState().selectedNodeId).toBe("node-123");
    useCanvasStore.getState().setSelectedNodeId(null);
    expect(useCanvasStore.getState().selectedNodeId).toBeNull();
  });

  it("wires removeNode callback", () => {
    const mockFn = vi.fn();
    useCanvasStore.getState().setRemoveNode(mockFn);
    useCanvasStore.getState().removeNode("test-id");
    expect(mockFn).toHaveBeenCalledWith("test-id");
  });

  it("wires updateNodeName callback", () => {
    const mockFn = vi.fn();
    useCanvasStore.getState().setUpdateNodeName(mockFn);
    useCanvasStore.getState().updateNodeName("test-id", "new-name");
    expect(mockFn).toHaveBeenCalledWith("test-id", "new-name");
  });

  it("wires updateNodeAgentStatus callback", () => {
    const mockFn = vi.fn();
    useCanvasStore.getState().setUpdateNodeAgentStatus(mockFn);
    useCanvasStore.getState().updateNodeAgentStatus("test-id", "ok", "All good");
    expect(mockFn).toHaveBeenCalledWith("test-id", "ok", "All good");
  });

  it("wires addNode callback", () => {
    const mockFn = vi.fn();
    useCanvasStore.getState().setAddNode(mockFn);
    const node = { id: "n1", position: { x: 0, y: 0 }, data: {} };
    useCanvasStore.getState().addNode(node);
    expect(mockFn).toHaveBeenCalledWith(node);
  });
});
