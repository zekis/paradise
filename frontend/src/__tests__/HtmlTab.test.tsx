import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HtmlTab } from "@/components/HtmlTab";
import { TEST_API, TEST_NODE_ID } from "./test-utils";

describe("HtmlTab", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "<h1>Hello</h1>" }),
    } as Response);
  });

  it("shows placeholder when no content loaded", () => {
    render(<HtmlTab nodeId={TEST_NODE_ID} api={TEST_API} filename="dashboard.html" visible={false} />);
    expect(screen.getByText(/No dashboard.html yet/)).toBeDefined();
  });

  it("loads content when visible changes to true", async () => {
    const { rerender } = render(
      <HtmlTab nodeId={TEST_NODE_ID} api={TEST_API} filename="dashboard.html" visible={false} />
    );

    rerender(
      <HtmlTab nodeId={TEST_NODE_ID} api={TEST_API} filename="dashboard.html" visible={true} />
    );

    await waitFor(() => {
      const iframe = document.querySelector("iframe");
      expect(iframe).toBeDefined();
    });
  });

  it("shows error on fetch failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("fail"));
    const { rerender } = render(
      <HtmlTab nodeId={TEST_NODE_ID} api={TEST_API} filename="dashboard.html" visible={false} />
    );

    rerender(
      <HtmlTab nodeId={TEST_NODE_ID} api={TEST_API} filename="dashboard.html" visible={true} />
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to load")).toBeDefined();
    });
  });
});
