import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { InfoTab } from "@/components/InfoTab";
import { TEST_API, TEST_NODE_ID } from "./test-utils";

describe("InfoTab", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        container_id: "abc123",
        status: "running",
        name: "test-bot",
        created_at: null,
        stats: {
          cpu_percent: 2.5,
          memory_usage_mb: 64,
          memory_limit_mb: 512,
          memory_percent: 12.5,
        },
      }),
    } as Response);
  });

  it("displays node stats after loading", async () => {
    render(<InfoTab nodeId={TEST_NODE_ID} api={TEST_API} />);
    expect(screen.getByText("Loading...")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("running")).toBeDefined();
      expect(screen.getByText("abc123")).toBeDefined();
    });
  });

  it("shows error when fetch fails", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("fail"));
    render(<InfoTab nodeId={TEST_NODE_ID} api={TEST_API} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load stats")).toBeDefined();
    });
  });
});
