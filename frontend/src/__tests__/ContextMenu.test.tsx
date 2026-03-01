import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextMenu } from "@/components/ContextMenu";
import { TEST_API, TEST_NODE_ID } from "./test-utils";

vi.mock("@/store/canvasStore", () => ({
  useCanvasStore: () => ({
    api: TEST_API,
    addNode: vi.fn(),
  }),
}));

describe("ContextMenu", () => {
  it("renders node menu items when nodeId is provided", () => {
    render(
      <ContextMenu
        nodeId={TEST_NODE_ID}
        position={{ x: 100, y: 200 }}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("Clone")).toBeDefined();
    expect(screen.getByText("Restart")).toBeDefined();
    expect(screen.getByText("Rebuild")).toBeDefined();
    expect(screen.getByText("Delete")).toBeDefined();
  });

  it("renders pane menu items when no nodeId", () => {
    render(
      <ContextMenu
        position={{ x: 100, y: 200 }}
        onClose={vi.fn()}
        onAddBot={vi.fn()}
      />
    );
    expect(screen.getByText("Create")).toBeDefined();
  });
});
