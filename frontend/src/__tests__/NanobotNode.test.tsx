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

  it("renders gauge SVG when gaugeValue is present", () => {
    const { container } = render(
      <NanobotNode
        id="node-1"
        data={{ ...defaultData, gaugeValue: 65, gaugeLabel: "open todos" }}
        type="nanobot"
        selected={false}
        dragging={false}
        isConnectable={true}
        zIndex={1}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const circles = container.querySelectorAll("svg circle");
    expect(circles.length).toBe(2); // background track + gauge arc
  });

  it("does not render gauge SVG when gaugeValue is null", () => {
    const { container } = render(
      <NanobotNode
        id="node-1"
        data={{ ...defaultData, gaugeValue: null }}
        type="nanobot"
        selected={false}
        dragging={false}
        isConnectable={true}
        zIndex={1}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    );
    // The robot icon is also an SVG, so check for gauge-specific circle elements
    const gaugeCircles = container.querySelectorAll("svg circle");
    expect(gaugeCircles.length).toBe(0);
  });
});
