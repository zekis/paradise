import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { TEST_API, TEST_NODE_ID } from "./test-utils";

// Mock the canvas store
vi.mock("@/store/canvasStore", () => ({
  useCanvasStore: () => ({
    api: TEST_API,
    removeNode: vi.fn(),
  }),
}));

describe("DeleteConfirmModal", () => {
  it("renders with bot name", () => {
    render(<DeleteConfirmModal nodeId={TEST_NODE_ID} label="test-bot" onClose={vi.fn()} />);
    expect(screen.getByText("test-bot")).toBeDefined();
    expect(screen.getByText("Delete nanobot")).toBeDefined();
  });

  it("calls onClose when Cancel clicked", () => {
    const onClose = vi.fn();
    render(<DeleteConfirmModal nodeId={TEST_NODE_ID} label="test-bot" onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <DeleteConfirmModal nodeId={TEST_NODE_ID} label="test-bot" onClose={onClose} />
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
