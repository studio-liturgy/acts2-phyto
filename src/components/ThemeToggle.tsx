import { useEffect, useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import { Sun, Moon } from "lucide-react";

// The knob is the foreground colour (white in dark mode, black in light), so
// the icon inside it takes the background colour: black on dark, white on light.
const iconColor = "text-background";

export function ThemeToggle({
  className = "",
  dark,
  onToggle,
}: {
  className?: string;
  /** Controlled: another theme than the app's (the phone view's Theme). */
  dark?: boolean;
  onToggle?: () => void;
}) {
  const { mode, toggle: toggleApp } = useTheme();
  // Only reflect the real theme after hydration to avoid SSR/client mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const controlled = dark !== undefined;
  const isDark = controlled ? dark : mounted && mode === "dark";
  const toggle = controlled ? (onToggle ?? (() => {})) : toggleApp;
  // Controlled, the knob is the surrounding text colour (white on a dark
  // panel), so the icon is the opposite one rather than the app's background.
  const icon = controlled ? (isDark ? "text-black" : "text-white") : iconColor;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      suppressHydrationWarning
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-current/40 bg-transparent transition-opacity duration-200 hover:opacity-80 ${className}`}
    >
      <span
        className="absolute top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-current transition-all duration-200"
        style={{ left: isDark ? "calc(100% - 1.25rem - 2px)" : "2px" }}
        suppressHydrationWarning
      >
        {isDark ? <Moon className={`h-3 w-3 ${icon}`} /> : <Sun className={`h-3 w-3 ${icon}`} />}
      </span>
    </button>
  );
}
