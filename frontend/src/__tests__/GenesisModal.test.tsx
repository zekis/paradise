import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GenesisModal } from "@/components/GenesisModal";

describe("GenesisModal", () => {
  it("renders the genesis header", () => {
    render(<GenesisModal onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByText("Genesis")).toBeDefined();
    expect(screen.getByText("What should this agent be?")).toBeDefined();
  });

  it("shows example chips", () => {
    render(<GenesisModal onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByText("Weather dashboard")).toBeDefined();
    expect(screen.getByText("Code reviewer")).toBeDefined();
  });

  it("calls onCreate with null when Skip clicked", () => {
    const onCreate = vi.fn();
    render(<GenesisModal onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.click(screen.getByText("Skip"));
    expect(onCreate).toHaveBeenCalledWith(null);
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<GenesisModal onClose={onClose} onCreate={vi.fn()} />);
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("fills input when example chip clicked", () => {
    render(<GenesisModal onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByText("Weather dashboard"));
    const input = screen.getByPlaceholderText(/Proxmox/) as HTMLInputElement;
    expect(input.value).toBe("Weather dashboard");
  });
});
