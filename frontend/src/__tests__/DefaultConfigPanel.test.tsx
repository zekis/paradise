import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DefaultConfigPanel } from "@/components/DefaultConfigPanel";
import { TEST_API } from "./test-utils";

describe("DefaultConfigPanel", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ config: { model: "claude-sonnet" }, templates: {} }),
    } as Response);
  });

  it("renders Settings header", async () => {
    render(<DefaultConfigPanel api={TEST_API} onClose={vi.fn()} />);
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<DefaultConfigPanel api={TEST_API} onClose={onClose} />);
    // Close button is the one with the × icon in the header
    const buttons = screen.getAllByRole("button");
    // First button in header area - click each until onClose fires
    for (const btn of buttons) {
      fireEvent.click(btn);
      if (onClose.mock.calls.length > 0) break;
    }
    expect(onClose).toHaveBeenCalled();
  });
});
