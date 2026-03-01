import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
    setUpdateNodeIdentity: vi.fn(),
    setUpdateNodeName: vi.fn(),
    setUpdateNodeAgentStatus: vi.fn(),
    setAddNode: vi.fn(),
  };
  const useCanvasStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  );
  return { useCanvasStore };
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
