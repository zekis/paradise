import { create } from "zustand";
import { API_URL as API } from "@/lib/api";

export interface AreaSecurityStatus {
  hasPIN: boolean;
  isLockedOut: boolean;
  lockoutSecondsRemaining: number;
}

interface SecurityStore {
  // Per-area lock state (in-memory only — not persisted, each tab independent)
  lockedAreaIds: Set<string>;
  // Areas the user has successfully unlocked in this tab session
  unlockedThisSession: Set<string>;

  // Idle timeout (milliseconds; 0 = disabled)
  idleTimeoutMs: number;

  // Lock/unlock actions
  lockArea: (areaId: string) => void;
  unlockArea: (areaId: string) => void;
  isAreaLocked: (areaId: string) => boolean;

  // Status cache (fetched from API)
  areaStatuses: Record<string, AreaSecurityStatus>;
  fetchStatus: (areaId: string) => Promise<AreaSecurityStatus>;

  // PIN operations
  setPin: (areaId: string, pin: string, currentPin?: string) => Promise<void>;
  clearPin: (areaId: string, currentPin: string) => Promise<void>;
  verifyPin: (areaId: string, pin: string) => Promise<{ success: boolean; attemptsRemaining: number }>;

  // Idle timer management
  _idleTimer: ReturnType<typeof setTimeout> | null;
  resetIdleTimer: (areaId: string) => void;
  clearIdleTimer: () => void;
}

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const useSecurityStore = create<SecurityStore>((set, get) => ({
  lockedAreaIds: new Set(),
  unlockedThisSession: new Set(),
  idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,

  lockArea: (areaId) =>
    set((s) => {
      const next = new Set(s.lockedAreaIds);
      next.add(areaId);
      return { lockedAreaIds: next };
    }),

  unlockArea: (areaId) =>
    set((s) => {
      const nextLocked = new Set(s.lockedAreaIds);
      nextLocked.delete(areaId);
      const nextUnlocked = new Set(s.unlockedThisSession);
      nextUnlocked.add(areaId);
      return { lockedAreaIds: nextLocked, unlockedThisSession: nextUnlocked };
    }),

  isAreaLocked: (areaId) => get().lockedAreaIds.has(areaId),

  areaStatuses: {},

  fetchStatus: async (areaId) => {
    try {
      const res = await fetch(`${API}/api/areas/${areaId}/security/status`);
      if (!res.ok) throw new Error("Failed to fetch security status");
      const data = await res.json();
      const status: AreaSecurityStatus = {
        hasPIN: data.has_pin,
        isLockedOut: data.is_locked_out,
        lockoutSecondsRemaining: data.lockout_seconds_remaining,
      };
      set((s) => ({ areaStatuses: { ...s.areaStatuses, [areaId]: status } }));
      return status;
    } catch {
      return { hasPIN: false, isLockedOut: false, lockoutSecondsRemaining: 0 };
    }
  },

  setPin: async (areaId, pin, currentPin?) => {
    const body: Record<string, string | null> = { pin };
    if (currentPin) body.current_pin = currentPin;
    const res = await fetch(`${API}/api/areas/${areaId}/security/set-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Failed to set PIN");
    }
    await get().fetchStatus(areaId);
  },

  clearPin: async (areaId, currentPin) => {
    const res = await fetch(`${API}/api/areas/${areaId}/security/set-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: null, current_pin: currentPin }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Failed to clear PIN");
    }
    // Remove from locked sets since PIN is cleared
    set((s) => {
      const nextLocked = new Set(s.lockedAreaIds);
      nextLocked.delete(areaId);
      const nextUnlocked = new Set(s.unlockedThisSession);
      nextUnlocked.delete(areaId);
      return { lockedAreaIds: nextLocked, unlockedThisSession: nextUnlocked };
    });
    await get().fetchStatus(areaId);
  },

  verifyPin: async (areaId, pin) => {
    const res = await fetch(`${API}/api/areas/${areaId}/security/verify-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const secs = data.detail?.seconds_remaining ?? 0;
      await get().fetchStatus(areaId);
      throw new Error(`locked_out:${secs}`);
    }
    if (!res.ok) throw new Error("Verify PIN request failed");
    const data = await res.json();
    if (data.success) {
      get().unlockArea(areaId);
      get().resetIdleTimer(areaId);
    }
    await get().fetchStatus(areaId);
    return { success: data.success, attemptsRemaining: data.attempts_remaining };
  },

  _idleTimer: null,

  resetIdleTimer: (areaId) => {
    const { idleTimeoutMs, _idleTimer } = get();
    if (_idleTimer) clearTimeout(_idleTimer);
    if (idleTimeoutMs <= 0) {
      set({ _idleTimer: null });
      return;
    }
    const timer = setTimeout(() => {
      const { areaStatuses } = get();
      const status = areaStatuses[areaId];
      if (status?.hasPIN) {
        get().lockArea(areaId);
      }
      set({ _idleTimer: null });
    }, idleTimeoutMs);
    set({ _idleTimer: timer });
  },

  clearIdleTimer: () => {
    const { _idleTimer } = get();
    if (_idleTimer) clearTimeout(_idleTimer);
    set({ _idleTimer: null });
  },
}));
