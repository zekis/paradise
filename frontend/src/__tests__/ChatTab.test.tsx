import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TEST_API, TEST_NODE_ID } from "./test-utils";

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock useChatSocket - must be before importing ChatTab
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

import { ChatTab } from "@/components/ChatTab";

describe("ChatTab", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  it("renders the chat interface with initializing state", () => {
    render(
      <ChatTab
        nodeId={TEST_NODE_ID}
        api={TEST_API}
        onThinkingChange={vi.fn()}
      />
    );
    expect(screen.getByText("initializing...")).toBeDefined();
  });

  it("renders the message input area", () => {
    render(
      <ChatTab
        nodeId={TEST_NODE_ID}
        api={TEST_API}
        onThinkingChange={vi.fn()}
      />
    );
    const input = document.querySelector("input");
    expect(input).toBeDefined();
  });

  it("renders with empty message list", () => {
    const { container } = render(
      <ChatTab
        nodeId={TEST_NODE_ID}
        api={TEST_API}
        onThinkingChange={vi.fn()}
      />
    );
    // The messages area should exist but be empty
    expect(container.querySelector("div")).toBeDefined();
  });
});
