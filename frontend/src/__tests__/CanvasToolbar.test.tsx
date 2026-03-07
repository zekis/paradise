import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanvasToolbar } from "@/components/CanvasToolbar";

describe("CanvasToolbar", () => {
  it("renders the theme toggle button", () => {
    render(<CanvasToolbar />);
    // Theme button has a title like "Theme: Dark" / "Theme: Light" / "Theme: System"
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(1);
  });
});
