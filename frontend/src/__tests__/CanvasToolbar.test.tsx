import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CanvasToolbar } from "@/components/CanvasToolbar";

describe("CanvasToolbar", () => {
  it("renders settings and add buttons", () => {
    render(
      <CanvasToolbar showSettings={false} onToggleSettings={vi.fn()} onAddBot={vi.fn()} />
    );
    expect(screen.getByTitle("Default Config")).toBeDefined();
    expect(screen.getByTitle("Add Nanobot")).toBeDefined();
  });

  it("calls onToggleSettings when settings clicked", () => {
    const onToggle = vi.fn();
    render(
      <CanvasToolbar showSettings={false} onToggleSettings={onToggle} onAddBot={vi.fn()} />
    );
    fireEvent.click(screen.getByTitle("Default Config"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("calls onAddBot when add clicked", () => {
    const onAdd = vi.fn();
    render(
      <CanvasToolbar showSettings={false} onToggleSettings={vi.fn()} onAddBot={onAdd} />
    );
    fireEvent.click(screen.getByTitle("Add Nanobot"));
    expect(onAdd).toHaveBeenCalled();
  });
});
