import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useChatSocket } from "@/hooks/useChatSocket";

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

describe("useChatSocket", () => {
  let origWS: typeof globalThis.WebSocket;

  beforeEach(() => {
    origWS = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ([]),
    } as unknown as Response);
  });

  afterEach(() => {
    globalThis.WebSocket = origWS;
    vi.restoreAllMocks();
  });

  it("initializes with default state", () => {
    const { result } = renderHook(() =>
      useChatSocket({
        wsUrl: "ws://localhost:8000/api/nodes/node-1/chat",
        nodeId: "test-node",
        api: "http://localhost:8000",
        genesisTemplate: (p: string) => p,
      })
    );
    expect(result.current.messages).toEqual([]);
    expect(result.current.connected).toBe(false);
    expect(result.current.initializing).toBe(true);
    expect(result.current.thinking).toBe(false);
  });

  it("exposes sendMessage function", () => {
    const { result } = renderHook(() =>
      useChatSocket({
        wsUrl: "ws://localhost:8000/api/nodes/node-1/chat",
        nodeId: "test-node",
        api: "http://localhost:8000",
        genesisTemplate: (p: string) => p,
      })
    );
    expect(typeof result.current.sendMessage).toBe("function");
    expect(typeof result.current.sendGenesis).toBe("function");
  });

  it("uses display_content from history when available", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ([
        { role: "user", content: "full genesis template...", message_type: "genesis", display_content: "Genesis: Weather" },
        { role: "assistant", content: "I'll help you build that." },
        { role: "assistant", content: 'write_file("dashboard.html")', message_type: "tool_call" },
      ]),
    } as unknown as Response);

    const { result } = renderHook(() =>
      useChatSocket({
        wsUrl: "ws://localhost:8000/api/nodes/node-1/chat",
        nodeId: "test-node-display",
        api: "http://localhost:8000",
        genesisTemplate: (p: string) => p,
      })
    );

    await vi.waitFor(() => {
      expect(result.current.messages.length).toBe(3);
    });
    // Genesis message uses display_content instead of full template
    expect(result.current.messages[0].content).toBe("Genesis: Weather");
    // Regular message uses content as-is
    expect(result.current.messages[1].content).toBe("I'll help you build that.");
    // Tool call carries message_type
    expect(result.current.messages[2].message_type).toBe("tool_call");
    expect(result.current.messages[2].content).toBe('write_file("dashboard.html")');
  });
});
