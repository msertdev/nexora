"use client";

import { useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);

      if (stored) {
        setValue(JSON.parse(stored) as T);
      }
    } catch {
      setError("Saved workspace data could not be loaded.");
    } finally {
      setReady(true);
    }
  }, [key]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      setError(null);
    } catch {
      setError("Local storage is unavailable in this browser.");
    }
  }, [key, ready, value]);

  return { value, setValue, ready, error };
}
