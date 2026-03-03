import { create } from "zustand";

type ThemeMode = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

interface ThemeStore {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  cycleTheme: () => void;
  initTheme: () => void;
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute(
    "data-theme",
    resolved === "dark" ? "" : "light"
  );
}

const CYCLE: ThemeMode[] = ["dark", "light", "system"];

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: "dark",
  resolved: "dark",

  cycleTheme: () => {
    const current = get().mode;
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    const resolved = resolveTheme(next);
    localStorage.setItem("paradise-theme", next);
    applyTheme(resolved);
    set({ mode: next, resolved });
  },

  initTheme: () => {
    const stored = localStorage.getItem("paradise-theme") as ThemeMode | null;
    const mode = stored && CYCLE.includes(stored) ? stored : "dark";
    const resolved = resolveTheme(mode);
    applyTheme(resolved);
    set({ mode, resolved });

    // Listen for OS preference changes (relevant when mode is "system")
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", () => {
      if (get().mode === "system") {
        const resolved = resolveTheme("system");
        applyTheme(resolved);
        set({ resolved });
      }
    });
  },
}));
