import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextMenu } from "@/components/ContextMenu";
import { TEST_API, TEST_NODE_ID } from "./test-utils";

vi.mock("@/store/canvasStore", () => ({
  useCanvasStore: () => ({
    api: TEST_API,
    addNode: vi.fn(),
    setNodeRebuilding: vi.fn(),
    setSelectedNodeId: vi.fn(),
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

  it("disables Restart and Rebuild when rebuilding is true", () => {
    render(
      <ContextMenu
        nodeId={TEST_NODE_ID}
        rebuilding={true}
        position={{ x: 100, y: 200 }}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const restartButton = screen.getByText("Restart").closest("button");
    const rebuildButton = screen.getByText("Rebuild").closest("button");
    expect(restartButton?.style.opacity).toBe("0.4");
    expect(rebuildButton?.style.opacity).toBe("0.4");
    expect(restartButton?.style.cursor).toBe("not-allowed");
    expect(rebuildButton?.style.cursor).toBe("not-allowed");
  });

  it("does not disable Restart and Rebuild when rebuilding is false", () => {
    render(
      <ContextMenu
        nodeId={TEST_NODE_ID}
        rebuilding={false}
        position={{ x: 100, y: 200 }}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const restartButton = screen.getByText("Restart").closest("button");
    const rebuildButton = screen.getByText("Rebuild").closest("button");
    expect(restartButton?.style.opacity).toBe("1");
    expect(rebuildButton?.style.opacity).toBe("1");
    expect(restartButton?.style.cursor).toBe("pointer");
    expect(rebuildButton?.style.cursor).toBe("pointer");
  });
});
