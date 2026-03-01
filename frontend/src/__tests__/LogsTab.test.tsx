import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LogsTab } from "@/components/LogsTab";
import { TEST_API, TEST_NODE_ID } from "./test-utils";

describe("LogsTab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(global, "fetch").mockResolvedValue({
      json: async () => ({ logs: "line1\nline2\nline3" }),
    } as Response);
  });

  it("fetches and displays logs", async () => {
    vi.useRealTimers();
    render(<LogsTab nodeId={TEST_NODE_ID} api={TEST_API} />);
    await waitFor(() => {
      expect(screen.getByText(/line1/)).toBeDefined();
    });
  });

  it("shows error on fetch failure", async () => {
    vi.useRealTimers();
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("fail"));
    render(<LogsTab nodeId={TEST_NODE_ID} api={TEST_API} />);
    await waitFor(() => {
      expect(screen.getByText("Failed to fetch logs")).toBeDefined();
    });
  });
});
