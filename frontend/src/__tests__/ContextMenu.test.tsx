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

  it("renders shortcut items in the context menu", () => {
    render(
      <ContextMenu
        nodeId={TEST_NODE_ID}
        position={{ x: 100, y: 200 }}
        shortcuts={[
          { label: "Web Admin", url: "http://10.0.0.1:8080/admin", icon: "mdiCog" },
          { label: "Grafana", url: "https://grafana.local:3000" },
        ]}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("Web Admin")).toBeDefined();
    expect(screen.getByText("Grafana")).toBeDefined();
  });

  it("filters out shortcuts with invalid URLs", () => {
    render(
      <ContextMenu
        nodeId={TEST_NODE_ID}
        position={{ x: 100, y: 200 }}
        shortcuts={[
          { label: "Valid", url: "https://example.com" },
          { label: "Bad Protocol", url: "javascript:alert(1)" },
          { label: "No URL", url: "" },
          { label: "FTP", url: "ftp://files.example.com" },
        ]}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("Valid")).toBeDefined();
    expect(screen.queryByText("Bad Protocol")).toBeNull();
    expect(screen.queryByText("No URL")).toBeNull();
    expect(screen.queryByText("FTP")).toBeNull();
  });

  it("limits shortcuts to 5 items", () => {
    const shortcuts = Array.from({ length: 8 }, (_, i) => ({
      label: `Link ${i + 1}`,
      url: `https://example.com/${i + 1}`,
    }));
    render(
      <ContextMenu
        nodeId={TEST_NODE_ID}
        position={{ x: 100, y: 200 }}
        shortcuts={shortcuts}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("Link 1")).toBeDefined();
    expect(screen.getByText("Link 5")).toBeDefined();
    expect(screen.queryByText("Link 6")).toBeNull();
  });
});
