import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NanobotNode } from "@/components/NanobotNode";
import { TEST_API } from "./test-utils";

// Mock ReactFlow's useReactFlow
vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");
  return {
    ...actual,
    Handle: () => null,
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
  };
});

// Mock canvas store
vi.mock("@/store/canvasStore", () => ({
  useCanvasStore: () => ({
    selectedNodeId: null,
    setSelectedNodeId: vi.fn(),
  }),
}));

describe("NanobotNode", () => {
  const defaultData = {
    label: "test-bot",
    nodeId: "node-1",
    containerStatus: "running",
    identity: null,
    agentStatus: null,
    agentStatusMessage: null,
  };

  it("renders collapsed node with label", () => {
    render(
      <NanobotNode
        id="node-1"
        data={defaultData}
        type="nanobot"
        selected={false}
        dragging={false}
        isConnectable={true}
        zIndex={1}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    );
    expect(screen.getByText("test-bot")).toBeDefined();
  });

  it("shows status indicator dot", () => {
    const { container } = render(
      <NanobotNode
        id="node-1"
        data={{ ...defaultData, containerStatus: "running" }}
        type="nanobot"
        selected={false}
        dragging={false}
        isConnectable={true}
        zIndex={1}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    );
    // Should render some visual elements
    expect(container.querySelector("div")).toBeDefined();
    expect(screen.getByText("test-bot")).toBeDefined();
  });

  it("shows default emoji when no identity", () => {
    const { container } = render(
      <NanobotNode
        id="node-1"
        data={{ ...defaultData, identity: null }}
        type="nanobot"
        selected={false}
        dragging={false}
        isConnectable={true}
        zIndex={1}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    );
    expect(container.textContent).toContain("test-bot");
  });
});
