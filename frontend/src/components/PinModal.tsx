"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@mdi/react";
import { mdiLock, mdiShieldLock, mdiClose } from "@mdi/js";
import { useSecurityStore } from "@/store/securityStore";

interface PinModalProps {
  areaId: string;
  mode: "unlock" | "set-pin";
  onClose: () => void;
  onSuccess?: () => void;
}

export function PinModal({ areaId, mode, onClose, onSuccess }: PinModalProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = useSecurityStore((s) => s.areaStatuses[areaId]);
  const hasExistingPin = status?.hasPIN ?? false;

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Check for existing lockout on mount (unlock mode)
  useEffect(() => {
    if (mode === "unlock" && status?.isLockedOut && status.lockoutSecondsRemaining > 0) {
      startLockoutCountdown(status.lockoutSecondsRemaining);
    }
  }, [mode, status?.isLockedOut, status?.lockoutSecondsRemaining]);

  const startLockoutCountdown = useCallback((seconds: number) => {
    setLockoutSeconds(seconds);
    setError(`Too many incorrect attempts. Try again in ${formatCountdown(seconds)}.`);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setLockoutSeconds((s) => {
        if (s <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setError(null);
          // Refresh status from server
          useSecurityStore.getState().fetchStatus(areaId);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [areaId]);

  const handleUnlock = async () => {
    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      setError("PIN must be 4-8 digits");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await useSecurityStore.getState().verifyPin(areaId, pin);
      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        setAttemptsRemaining(result.attemptsRemaining);
        if (result.attemptsRemaining > 0) {
          setError(
            `Incorrect PIN. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? "" : "s"} remaining.`
          );
        } else {
          setError("Too many incorrect attempts.");
        }
        setPin("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("locked_out:")) {
        const secs = parseInt(msg.split(":")[1], 10);
        startLockoutCountdown(secs);
      } else {
        setError("Failed to verify PIN. Please try again.");
      }
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async () => {
    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      setError("PIN must be 4-8 digits");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }
    if (hasExistingPin && (currentPin.length < 4 || !/^\d+$/.test(currentPin))) {
      setError("Enter your current PIN");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await useSecurityStore.getState().setPin(
        areaId,
        pin,
        hasExistingPin ? currentPin : undefined
      );
      // Update area store to reflect has_pin change
      const { areas } = await import("@/store/areaStore").then((m) => ({
        areas: m.useAreaStore.getState(),
      }));
      areas.updateArea(areaId, { has_pin: true });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to set PIN";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClearPin = async () => {
    if (currentPin.length < 4 || !/^\d+$/.test(currentPin)) {
      setError("Enter your current PIN to clear it");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await useSecurityStore.getState().clearPin(areaId, currentPin);
      const { areas } = await import("@/store/areaStore").then((m) => ({
        areas: m.useAreaStore.getState(),
      }));
      areas.updateArea(areaId, { has_pin: false });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to clear PIN";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isLockedOut = lockoutSeconds > 0;
  const isUnlockMode = mode === "unlock";

  const pinInputStyle = (hasError: boolean): React.CSSProperties => ({
    width: "100%",
    background: "var(--input-bg)",
    border: `1px solid ${hasError ? "var(--red)" : "var(--border)"}`,
    borderRadius: 6,
    padding: "10px 12px",
    color: "var(--text)",
    fontSize: 18,
    letterSpacing: 6,
    outline: "none",
    textAlign: "center",
    boxSizing: "border-box",
  });

  const filterDigits = (val: string) => val.replace(/\D/g, "").slice(0, 8);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--backdrop)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "24px 28px",
          width: 320,
          maxWidth: "calc(100vw - 32px)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 8px 32px var(--shadow-md)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon
              path={isUnlockMode ? mdiLock : mdiShieldLock}
              size={0.9}
              color="var(--accent)"
            />
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
              {isUnlockMode ? "Enter PIN" : hasExistingPin ? "Change PIN" : "Set PIN"}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
            }}
          >
            <Icon path={mdiClose} size={0.7} color="var(--text-muted)" />
          </button>
        </div>

        {/* Lockout countdown */}
        {isLockedOut && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--red)",
              textAlign: "center",
            }}
          >
            Too many incorrect attempts. Try again in{" "}
            <strong>{formatCountdown(lockoutSeconds)}</strong>.
          </div>
        )}

        {/* PIN inputs */}
        {!isLockedOut && (
          <>
            {/* Current PIN field (set-pin mode with existing PIN) */}
            {!isUnlockMode && hasExistingPin && (
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Current PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={currentPin}
                  onChange={(e) => {
                    setCurrentPin(filterDigits(e.target.value));
                    setError(null);
                  }}
                  placeholder="••••"
                  maxLength={8}
                  autoComplete="off"
                  style={pinInputStyle(!!error)}
                />
              </div>
            )}

            {/* Main PIN input */}
            <div>
              <label
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                {isUnlockMode ? "PIN" : "New PIN (4-8 digits)"}
              </label>
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => {
                  setPin(filterDigits(e.target.value));
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    isUnlockMode ? handleUnlock() : handleSetPin();
                  }
                }}
                placeholder="••••"
                maxLength={8}
                autoComplete="off"
                style={pinInputStyle(!!error)}
              />
            </div>

            {/* Confirm field for set-pin mode */}
            {!isUnlockMode && (
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Confirm PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(e) => {
                    setConfirmPin(filterDigits(e.target.value));
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSetPin();
                  }}
                  placeholder="••••"
                  maxLength={8}
                  autoComplete="off"
                  style={pinInputStyle(!!error)}
                />
              </div>
            )}
          </>
        )}

        {/* Error message */}
        {error && !isLockedOut && (
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "var(--red)",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        )}

        {/* Attempts remaining hint */}
        {attemptsRemaining !== null &&
          attemptsRemaining > 0 &&
          !error && (
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"}{" "}
              remaining
            </p>
          )}

        {/* Action buttons */}
        {!isLockedOut && (
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 4,
            }}
          >
            {/* Clear PIN button (only in set-pin mode with existing PIN) */}
            {!isUnlockMode && hasExistingPin && (
              <button
                onClick={handleClearPin}
                disabled={loading}
                style={{
                  background: "transparent",
                  color: "var(--red)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 5,
                  padding: "7px 12px",
                  fontSize: 12,
                  cursor: loading ? "default" : "pointer",
                  marginRight: "auto",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                Clear PIN
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                background: "transparent",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "7px 16px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={isUnlockMode ? handleUnlock : handleSetPin}
              disabled={loading || pin.length < 4}
              style={{
                background:
                  pin.length >= 4 && !loading
                    ? "var(--accent)"
                    : "var(--overlay-light)",
                color:
                  pin.length >= 4 && !loading
                    ? "var(--text)"
                    : "var(--text-muted)",
                border: "none",
                borderRadius: 5,
                padding: "7px 16px",
                fontSize: 12,
                cursor:
                  pin.length >= 4 && !loading ? "pointer" : "default",
              }}
            >
              {loading
                ? "..."
                : isUnlockMode
                  ? "Unlock"
                  : "Set PIN"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatCountdown(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
