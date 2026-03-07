import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

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

// Mock ReactFlow and related hooks - inline values to avoid hoisting issues
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="reactflow">{children}</div>,
  ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  BackgroundVariant: { Dots: "dots" },
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  useReactFlow: () => ({ setViewport: vi.fn(), screenToFlowPosition: vi.fn((p: unknown) => p) }),
  addEdge: vi.fn(),
}));

vi.mock("@/store/canvasStore", () => {
  const state = {
    api: "http://localhost:8000",
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
    setUpdateEdgeChatEnabled: vi.fn(),
    resetForAreaSwitch: vi.fn(),
    checkedNodeIds: new Set(),
    clearCheckedNodes: vi.fn(),
  };
  const useCanvasStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  );
  return { useCanvasStore };
});

vi.mock("@/store/areaStore", () => {
  const state = {
    areas: [{ id: "area-1", name: "Main", sort_order: 0, node_count: 0 }],
    activeAreaId: "area-1",
    loaded: true,
    setAreas: vi.fn(),
    setActiveAreaId: vi.fn(),
  };
  const useAreaStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  );
  return { useAreaStore };
});

vi.spyOn(global, "fetch").mockResolvedValue({
  ok: true,
  json: async () => ([]),
} as Response);

import { Canvas } from "@/components/Canvas";

describe("Canvas", () => {
  it("renders the Paradise title", () => {
    render(<Canvas />);
    expect(screen.getByText("PARADISE")).toBeDefined();
  });

  it("renders the toolbar buttons", () => {
    render(<Canvas />);
    expect(screen.getByTitle("Default Config")).toBeDefined();
    expect(screen.getByTitle("Add Nanobot")).toBeDefined();
  });
});
