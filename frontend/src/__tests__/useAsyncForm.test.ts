import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAsyncForm } from "@/hooks/useAsyncForm";

describe("useAsyncForm", () => {
  it("initializes with loading state", () => {
    const { result } = renderHook(() =>
      useAsyncForm({
        loadFn: async () => "content",
        saveFn: async () => {},
      })
    );
    expect(result.current.loading).toBe(true);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBe(false);
  });

  it("loads content via loadFn", async () => {
    const loadFn = vi.fn().mockResolvedValue("loaded content");
    const { result } = renderHook(() =>
      useAsyncForm({ loadFn, saveFn: async () => {} })
    );

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.value).toBe("loaded content");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles load error", async () => {
    const loadFn = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() =>
      useAsyncForm({ loadFn, saveFn: async () => {} })
    );

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.error).toBe("Failed to load");
    expect(result.current.loading).toBe(false);
  });

  it("saves content via saveFn", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAsyncForm({ loadFn: async () => "initial", saveFn })
    );

    await act(async () => {
      result.current.setValue("updated");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(saveFn).toHaveBeenCalledWith("updated");
    expect(result.current.saving).toBe(false);
  });

  it("handles save error", async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error("Save failed"));
    const { result } = renderHook(() =>
      useAsyncForm({ loadFn: async () => "", saveFn })
    );

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error).toBe("Save failed");
    expect(result.current.saving).toBe(false);
  });
});
