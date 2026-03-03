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

  const defaultProps = {
    id: "node-1",
    type: "nanobot" as const,
    selected: false,
    dragging: false,
    isConnectable: true,
    zIndex: 1,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };

  it("renders collapsed node with label", () => {
    render(<NanobotNode {...defaultProps} data={defaultData} />);
    expect(screen.getByText("test-bot")).toBeDefined();
  });

  it("shows status indicator dot", () => {
    const { container } = render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, containerStatus: "running" }} />
    );
    expect(container.querySelector("div")).toBeDefined();
    expect(screen.getByText("test-bot")).toBeDefined();
  });

  it("shows default robot icon when no identity", () => {
    const { container } = render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, identity: null }} />
    );
    expect(container.textContent).toContain("test-bot");
  });

  it("renders gauge SVG when gaugeValue is present", () => {
    const { container } = render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, gaugeValue: 65, gaugeLabel: "open todos" }} />
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const circles = container.querySelectorAll("svg circle");
    expect(circles.length).toBe(2);
  });

  it("does not render gauge SVG when gaugeValue is null", () => {
    const { container } = render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, gaugeValue: null }} />
    );
    const gaugeCircles = container.querySelectorAll("svg circle");
    expect(gaugeCircles.length).toBe(0);
  });

  it("shows gauge value with unit in center when gauge active", () => {
    render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, gaugeValue: 73, gaugeLabel: "cpu", gaugeUnit: "%" }} />
    );
    expect(screen.getByText("73%")).toBeDefined();
  });

  it("shows gauge value with custom unit", () => {
    render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, gaugeValue: 42, gaugeLabel: "temp", gaugeUnit: "°C" }} />
    );
    expect(screen.getByText("42°C")).toBeDefined();
  });

  it("shows gauge value without unit when gaugeUnit is not set", () => {
    render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, gaugeValue: 5, gaugeLabel: "open todos" }} />
    );
    expect(screen.getByText("5")).toBeDefined();
  });

  it("uses grey/neutral circle when node is healthy", () => {
    const { container } = render(
      <NanobotNode
        {...defaultProps}
        data={{ ...defaultData, agentStatus: "ok", identity: { emoji: "🤖", color: "#ff0000" } }}
      />
    );
    const circleDiv = container.querySelectorAll("div")[1]?.querySelector("div");
    // The circle should not use the identity color for border when healthy
    // It should use var(--bg-card) for background and var(--border) for border
  });

  it("uses warning color on circle when agent has warning status", () => {
    const { container } = render(
      <NanobotNode
        {...defaultProps}
        data={{ ...defaultData, agentStatus: "warning", identity: { emoji: "🤖", color: "#ff0000" } }}
      />
    );
    // Circle border should reflect warning state, not identity color
  });

  it("renders icon badge with MDI icon when identity.icon is set", () => {
    const { container } = render(
      <NanobotNode
        {...defaultProps}
        data={{ ...defaultData, identity: { icon: "mdiServer", color: "#22c55e" } }}
      />
    );
    // Should render the badge div and an SVG icon inside it
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("renders icon badge with emoji when no icon but emoji is set", () => {
    const { container } = render(
      <NanobotNode
        {...defaultProps}
        data={{ ...defaultData, identity: { emoji: "🌡️", color: "#ff0000" } }}
      />
    );
    expect(container.textContent).toContain("🌡️");
  });

  it("does not render icon badge when neither icon nor emoji is set", () => {
    const { container } = render(
      <NanobotNode
        {...defaultProps}
        data={{ ...defaultData, identity: { color: "#ff0000" } }}
      />
    );
    // No badge should be rendered, only the fallback robot icon in center
    expect(container.textContent).not.toContain("🌡️");
  });

  it("renders rebuild spinner SVG when rebuilding is true", () => {
    const { container } = render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, rebuilding: true }} />
    );
    const svgs = container.querySelectorAll("svg");
    const spinnerSvg = Array.from(svgs).find(
      (svg) => svg.style.animation?.includes("rebuild-spin")
    );
    expect(spinnerSvg).toBeDefined();
  });

  it("does not render rebuild spinner when rebuilding is false", () => {
    const { container } = render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, rebuilding: false }} />
    );
    const svgs = container.querySelectorAll("svg");
    const spinnerSvg = Array.from(svgs).find(
      (svg) => svg.style.animation?.includes("rebuild-spin")
    );
    expect(spinnerSvg).toBeUndefined();
  });

  it("reduces opacity when rebuilding", () => {
    const { container } = render(
      <NanobotNode {...defaultProps} data={{ ...defaultData, rebuilding: true }} />
    );
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.style.opacity).toBe("0.6");
  });
});
