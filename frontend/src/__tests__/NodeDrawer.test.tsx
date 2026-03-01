import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TEST_API } from "./test-utils";

vi.mock("@/store/canvasStore", () => ({
  useCanvasStore: () => ({
    api: TEST_API,
    updateNodeIdentity: vi.fn(),
    updateNodeName: vi.fn(),
    updateNodeAgentStatus: vi.fn(),
    updateNodeGauge: vi.fn(),
  }),
}));

// Mock useChatSocket for ChatTab
vi.mock("@/hooks/useChatSocket", () => ({
  useChatSocket: () => ({
    messages: [],
    connected: false,
    agentReady: null,
    initializing: true,
    thinking: false,
    genesisInProgress: false,
    sendMessage: vi.fn(),
    sendGenesis: vi.fn(),
  }),
}));

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

import { NodeDrawer } from "@/components/NodeDrawer";

describe("NodeDrawer", () => {
  const defaultData = {
    label: "test-bot",
    nodeId: "node-1",
    containerStatus: "running" as const,
    identity: null,
    agentStatus: null,
    agentStatusMessage: null,
  };

  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  it("renders the node label in the header", () => {
    render(<NodeDrawer data={defaultData} onClose={vi.fn()} />);
    expect(screen.getByText("test-bot")).toBeDefined();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<NodeDrawer data={defaultData} onClose={onClose} />);
    const closeBtn = screen.getByTitle("Close");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders tab buttons", () => {
    render(<NodeDrawer data={defaultData} onClose={vi.fn()} />);
    expect(screen.getByText("Chat")).toBeDefined();
    expect(screen.getByText("Agent")).toBeDefined();
    expect(screen.getByText("Config")).toBeDefined();
    expect(screen.getByText("Logs")).toBeDefined();
    expect(screen.getByText("Info")).toBeDefined();
  });

  it("renders delete button", () => {
    render(<NodeDrawer data={defaultData} onClose={vi.fn()} />);
    expect(screen.getByTitle("Delete nanobot")).toBeDefined();
  });
});
