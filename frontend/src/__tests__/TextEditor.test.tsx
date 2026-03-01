import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextEditor } from "@/components/TextEditor";

describe("TextEditor", () => {
  const defaultProps = {
    value: "test content",
    onChange: vi.fn(),
    error: null,
    saving: false,
    onSave: vi.fn(),
    onReload: vi.fn(),
  };

  it("renders textarea with value", () => {
    render(<TextEditor {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDefined();
    expect((textarea as HTMLTextAreaElement).value).toBe("test content");
  });

  it("calls onChange when textarea value changes", () => {
    const onChange = vi.fn();
    render(<TextEditor {...defaultProps} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "new" } });
    expect(onChange).toHaveBeenCalledWith("new");
  });

  it("shows error message when error is set", () => {
    render(<TextEditor {...defaultProps} error="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("shows success message", () => {
    render(<TextEditor {...defaultProps} success={true} />);
    expect(screen.getByText("Saved")).toBeDefined();
  });

  it("calls onSave when Save button clicked", () => {
    const onSave = vi.fn();
    render(<TextEditor {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalled();
  });

  it("calls onReload when Reload button clicked", () => {
    const onReload = vi.fn();
    render(<TextEditor {...defaultProps} onReload={onReload} />);
    fireEvent.click(screen.getByText("Reload"));
    expect(onReload).toHaveBeenCalled();
  });

  it("shows custom save label", () => {
    render(<TextEditor {...defaultProps} saveLabel="Save & Reload" />);
    expect(screen.getByText("Save & Reload")).toBeDefined();
  });

  it("disables save button when saving", () => {
    render(<TextEditor {...defaultProps} saving={true} />);
    expect(screen.getByText("Saving...")).toBeDefined();
  });
});
