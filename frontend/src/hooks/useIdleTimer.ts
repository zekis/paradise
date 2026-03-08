"use client";

import { useEffect } from "react";
import { useSecurityStore } from "@/store/securityStore";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

export function useIdleTimer(areaId: string | null) {
  useEffect(() => {
    if (!areaId) return;

    // Start timer immediately
    useSecurityStore.getState().resetIdleTimer(areaId);

    const reset = () => {
      // Don't reset timer if the area is already locked
      if (!useSecurityStore.getState().isAreaLocked(areaId)) {
        useSecurityStore.getState().resetIdleTimer(areaId);
      }
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, reset, { passive: true });
    }

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, reset);
      }
      useSecurityStore.getState().clearIdleTimer();
    };
  }, [areaId]);
}
