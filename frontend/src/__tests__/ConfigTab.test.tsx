import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConfigTab } from "@/components/ConfigTab";
import { TEST_API, TEST_NODE_ID } from "./test-utils";

describe("ConfigTab", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ config: { model: "gpt-4" } }),
    } as Response);
  });

  it("loads and displays config as JSON", async () => {
    render(<ConfigTab nodeId={TEST_NODE_ID} api={TEST_API} />);
    expect(screen.getByText("Loading...")).toBeDefined();

    await waitFor(() => {
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toContain("gpt-4");
    });
  });

  it("shows error on load failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("fail"));
    render(<ConfigTab nodeId={TEST_NODE_ID} api={TEST_API} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load")).toBeDefined();
    });
  });
});
