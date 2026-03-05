import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { TEST_API } from "./test-utils";

// Provide EventSource stub for jsdom
beforeAll(() => {
  global.EventSource = class {
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    close = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
  } as unknown as typeof EventSource;
});

// Must mock before importing useCanvasSync
vi.mock("@xyflow/react", () => ({
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  useReactFlow: () => ({ setViewport: vi.fn() }),
  addEdge: vi.fn(),
}));

vi.mock("@/store/canvasStore", () => {
  const state = {
    api: TEST_API,
    setApi: vi.fn(),
    selectedNodeId: null,
    setSelectedNodeId: vi.fn(),
    setRemoveNode: vi.fn(),
    setRemoveEdge: vi.fn(),
    setUpdateNodeIdentity: vi.fn(),
    setUpdateNodeName: vi.fn(),
    setUpdateNodeAgentStatus: vi.fn(),
    setUpdateNodeGauge: vi.fn(),
    setAddNode: vi.fn(),
    setAddEdge: vi.fn(),
    setSetNodeRebuilding: vi.fn(),
    setSetNodeArchived: vi.fn(),
    setReplaceNode: vi.fn(),
    getState: () => state,
  };
  const useCanvasStore = Object.assign(
    () => state,
    { getState: () => state },
  );
  return { useCanvasStore };
});

vi.spyOn(global, "fetch").mockResolvedValue({
  ok: true,
  json: async () => ([]),
} as Response);

describe("useCanvasSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns expected interface", async () => {
    const { useCanvasSync } = await import("@/hooks/useCanvasSync");
    const { result } = renderHook(() => useCanvasSync());
    expect(result.current.nodes).toBeDefined();
    expect(result.current.edges).toBeDefined();
    expect(typeof result.current.onNodesChange).toBe("function");
    expect(typeof result.current.onEdgesChange).toBe("function");
    expect(typeof result.current.onConnect).toBe("function");
    expect(typeof result.current.onNodeDragStop).toBe("function");
    expect(typeof result.current.onConnectStart).toBe("function");
    expect(typeof result.current.onConnectEnd).toBe("function");
    expect(typeof result.current.saveViewport).toBe("function");
  });

  it("onNodeDragStop does not throw when node is undefined", async () => {
    const { useCanvasSync } = await import("@/hooks/useCanvasSync");
    const { result } = renderHook(() => useCanvasSync());
    const fakeEvent = {} as React.MouseEvent;
    // React Flow can pass undefined when the node is removed during drag
    expect(() => {
      result.current.onNodeDragStop(fakeEvent, undefined as never);
    }).not.toThrow();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/nodes/"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
