"use client";

import { useCallback, useState } from "react";

interface AsyncFormState {
  value: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: boolean;
}

interface AsyncFormActions {
  setValue: (v: string) => void;
  load: () => Promise<void>;
  save: () => Promise<void>;
}

export function useAsyncForm({
  loadFn,
  saveFn,
}: {
  loadFn: () => Promise<string>;
  saveFn: (value: string) => Promise<void>;
}): AsyncFormState & AsyncFormActions {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadFn();
      setValue(result);
      setError(null);
    } catch (error) {
      console.error('Failed to load form data:', error);
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }, [loadFn]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await saveFn(value);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [saveFn, value]);

  return { value, loading, saving, error, success, setValue, load, save };
}
