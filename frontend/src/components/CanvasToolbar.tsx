"use client";

import { useEffect } from "react";
import Icon from "@mdi/react";
import { mdiCog, mdiPlus, mdiWeatherSunny, mdiWeatherNight, mdiThemeLightDark } from "@mdi/js";
import { useThemeStore } from "@/store/themeStore";

interface CanvasToolbarProps {
  showSettings: boolean;
  onToggleSettings: () => void;
  onAddBot: () => void;
}

const themeIcon: Record<string, string> = {
  dark: mdiWeatherNight,
  light: mdiWeatherSunny,
  system: mdiThemeLightDark,
};

const themeLabel: Record<string, string> = {
  dark: "Theme: Dark",
  light: "Theme: Light",
  system: "Theme: System",
};

export function CanvasToolbar({ showSettings, onToggleSettings, onAddBot }: CanvasToolbarProps) {
  const mode = useThemeStore((s) => s.mode);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const initTheme = useThemeStore((s) => s.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        display: "flex",
        gap: 10,
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <button
        onClick={cycleTheme}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "var(--bg-card)",
          color: "var(--text-muted)",
          border: "1px solid var(--border)",
          fontSize: 18,
          cursor: "pointer",
          boxShadow: "0 4px 12px var(--shadow-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s, color 0.2s",
        }}
        title={themeLabel[mode]}
      >
        <Icon path={themeIcon[mode]} size={0.9} />
      </button>
      <button
        onClick={onToggleSettings}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: showSettings ? "var(--accent)" : "var(--bg-card)",
          color: showSettings ? "var(--text)" : "var(--text-muted)",
          border: "1px solid var(--border)",
          fontSize: 18,
          cursor: "pointer",
          boxShadow: "0 4px 12px var(--shadow-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s, color 0.2s",
        }}
        title="Default Config"
      >
        <Icon path={mdiCog} size={0.9} />
      </button>
      <button
        onClick={onAddBot}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "var(--accent)",
          color: "var(--text)",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 12px var(--shadow-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        title="Add Nanobot"
      >
        <Icon path={mdiPlus} size={1} />
      </button>
    </div>
  );
}
