"use client";

import Icon from "@mdi/react";
import { mdiLock, mdiLockOpen, mdiAlertOutline, mdiLockOutline } from "@mdi/js";
import { useSecurityStore } from "@/store/securityStore";
import { useAreaStore } from "@/store/areaStore";

interface SecurityBarProps {
  isMobile?: boolean;
  onOpenPinModal: (mode: "unlock" | "set-pin") => void;
}

export function SecurityBar({ isMobile, onOpenPinModal }: SecurityBarProps) {
  const activeAreaId = useAreaStore((s) => s.activeAreaId);
  const isLocked = useSecurityStore((s) =>
    activeAreaId ? s.lockedAreaIds.has(activeAreaId) : false
  );
  const status = useSecurityStore((s) =>
    activeAreaId ? s.areaStatuses[activeAreaId] : null
  );
  const lockArea = useSecurityStore((s) => s.lockArea);

  if (!activeAreaId) return null;

  // Don't render until status is fetched
  if (!status) return null;

  const height = isMobile ? 28 : 24;
  const fontSize = 11;

  // State 1: Locked
  if (isLocked) {
    return (
      <div
        onClick={() => onOpenPinModal("unlock")}
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: "rgba(239, 68, 68, 0.12)",
          borderBottom: "1px solid rgba(239, 68, 68, 0.3)",
          color: "var(--red)",
          fontSize,
          cursor: "pointer",
          flexShrink: 0,
          userSelect: "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background =
            "rgba(239, 68, 68, 0.18)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background =
            "rgba(239, 68, 68, 0.12)")
        }
      >
        <Icon path={mdiLock} size={0.5} />
        <span>Area locked — click to unlock</span>
      </div>
    );
  }

  // State 2: No PIN set (warning)
  if (!status.hasPIN) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: "rgba(234, 179, 8, 0.10)",
          borderBottom: "1px solid rgba(234, 179, 8, 0.25)",
          color: "var(--yellow)",
          fontSize,
          flexShrink: 0,
        }}
      >
        <Icon path={mdiAlertOutline} size={0.5} />
        <span>No PIN set</span>
        <button
          onClick={() => onOpenPinModal("set-pin")}
          style={{
            background: "rgba(234, 179, 8, 0.2)",
            border: "1px solid rgba(234, 179, 8, 0.4)",
            borderRadius: 3,
            padding: "1px 7px",
            fontSize: 10,
            color: "var(--yellow)",
            cursor: "pointer",
            marginLeft: 4,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(234, 179, 8, 0.3)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(234, 179, 8, 0.2)")
          }
        >
          Set PIN
        </button>
      </div>
    );
  }

  // State 3: Unlocked with PIN set
  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        background: "rgba(34, 197, 94, 0.06)",
        borderBottom: "1px solid rgba(34, 197, 94, 0.15)",
        color: "var(--green)",
        fontSize,
        flexShrink: 0,
        opacity: 0.8,
      }}
    >
      <Icon path={mdiLockOpen} size={0.5} />
      <span>Unlocked</span>
      <button
        onClick={() => onOpenPinModal("set-pin")}
        style={{
          background: "transparent",
          border: "none",
          fontSize: 10,
          color: "var(--text-muted)",
          cursor: "pointer",
          textDecoration: "underline",
          marginLeft: 4,
        }}
      >
        Change PIN
      </button>
      <button
        onClick={() => lockArea(activeAreaId)}
        title="Lock now"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          marginLeft: 2,
          display: "flex",
          alignItems: "center",
          opacity: 0.6,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
      >
        <Icon path={mdiLockOutline} size={0.45} color="var(--text-muted)" />
      </button>
    </div>
  );
}
