import { describe, it, expect } from "vitest";
import type { NanobotNodeData, NodeIdentity, NanobotFlowNode } from "@/types";

describe("types", () => {
  it("NanobotNodeData satisfies required shape", () => {
    const data: NanobotNodeData = {
      label: "test-bot",
      nodeId: "abc-123",
      containerStatus: "running",
      identity: null,
      agentStatus: null,
      agentStatusMessage: null,
    };
    expect(data.label).toBe("test-bot");
    expect(data.nodeId).toBe("abc-123");
  });

  it("NodeIdentity allows optional fields", () => {
    const identity: NodeIdentity = {
      emoji: "🤖",
      color: "var(--accent)",
      description: "A test bot",
      tabs: [{ name: "Status", file: "STATUS.md" }],
    };
    expect(identity.emoji).toBe("🤖");
    expect(identity.tabs).toHaveLength(1);
  });

  it("NanobotNodeData supports genesis fields", () => {
    const data: NanobotNodeData = {
      label: "genesis-bot",
      nodeId: "xyz-456",
      containerStatus: "running",
      identity: null,
      agentStatus: null,
      agentStatusMessage: null,
      genesisPrompt: "Weather dashboard",
      genesisActive: true,
    };
    expect(data.genesisPrompt).toBe("Weather dashboard");
    expect(data.genesisActive).toBe(true);
  });
});
