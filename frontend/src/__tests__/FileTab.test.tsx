import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FileTab } from "@/components/FileTab";
import { TEST_API, TEST_NODE_ID } from "./test-utils";

describe("FileTab", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "file contents here" }),
    } as Response);
  });

  it("does not load when not visible", () => {
    render(<FileTab nodeId={TEST_NODE_ID} api={TEST_API} filename="SYSTEM.md" visible={false} />);
    expect(screen.getByText("Loading...")).toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("loads content when visible", async () => {
    render(<FileTab nodeId={TEST_NODE_ID} api={TEST_API} filename="SYSTEM.md" visible={true} />);

    await waitFor(() => {
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toBe("file contents here");
    });
  });

  it("shows error on load failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("fail"));
    render(<FileTab nodeId={TEST_NODE_ID} api={TEST_API} filename="SYSTEM.md" visible={true} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load")).toBeDefined();
    });
  });
});
