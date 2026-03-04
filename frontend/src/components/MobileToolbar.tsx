"use client";

import { useEffect } from "react";
import Icon from "@mdi/react";
import {
  mdiArrowLeft,
  mdiCog,
  mdiPlus,
  mdiWeatherSunny,
  mdiWeatherNight,
  mdiThemeLightDark,
} from "@mdi/js";
import { useThemeStore } from "@/store/themeStore";

const themeIcon: Record<string, string> = {
  dark: mdiWeatherNight,
  light: mdiWeatherSunny,
  system: mdiThemeLightDark,
};

interface MobileToolbarProps {
  showBack: boolean;
  onBack: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  onAddBot: () => void;
}

export function MobileToolbar({ showBack, onBack, showSettings, onToggleSettings, onAddBot }: MobileToolbarProps) {
  const mode = useThemeStore((s) => s.mode);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const initTheme = useThemeStore((s) => s.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const btnStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "transparent",
    color: "var(--text-muted)",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {showBack ? (
          <button onClick={onBack} style={btnStyle} title="Back">
            <Icon path={mdiArrowLeft} size={0.9} />
          </button>
        ) : (
          <span style={{ fontWeight: 700, letterSpacing: 2, fontSize: 13, opacity: 0.6, paddingLeft: 8 }}>
            PARADISE
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button onClick={cycleTheme} style={btnStyle} title={`Theme: ${mode}`}>
          <Icon path={themeIcon[mode]} size={0.8} />
        </button>
        <button
          onClick={onToggleSettings}
          style={{
            ...btnStyle,
            background: showSettings ? "var(--accent)" : "transparent",
            color: showSettings ? "var(--text)" : "var(--text-muted)",
          }}
          title="Settings"
        >
          <Icon path={mdiCog} size={0.8} />
        </button>
        <button
          onClick={onAddBot}
          style={{
            ...btnStyle,
            background: "var(--accent)",
            color: "var(--text)",
            borderRadius: "50%",
          }}
          title="Add Nanobot"
        >
          <Icon path={mdiPlus} size={0.9} />
        </button>
      </div>
    </div>
  );
}
