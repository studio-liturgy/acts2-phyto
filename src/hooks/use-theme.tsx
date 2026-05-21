import { useEffect, useState, useCallback } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "phyto-theme";

function readCurrentMode(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function apply(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function useTheme() {
  // Match the class already set by the pre-hydration script to avoid SSR mismatch.
  const [mode, setModeState] = useState<ThemeMode>(() => readCurrentMode());

  useEffect(() => {
    apply(mode);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);
  const toggle = useCallback(() => {
    setModeState((m) => (m === "dark" ? "light" : "dark"));
  }, []);

  return { mode, setMode, toggle };
}
