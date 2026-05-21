import { useEffect, useState, useCallback } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "phyto-theme";

function getStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark") return v;
  // First visit: follow OS preference once, then persist via toggle.
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => getStoredMode());

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
