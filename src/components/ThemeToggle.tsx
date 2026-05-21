import { useTheme } from "@/hooks/use-theme";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, toggle } = useTheme();
  const isDark = mode === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-current/40 bg-transparent transition-opacity duration-200 hover:opacity-80 ${className}`}
    >
      <span
        className="absolute top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-current transition-all duration-200"
        style={{ left: isDark ? "calc(100% - 1.25rem - 2px)" : "2px" }}
      >
        {isDark ? (
          <Moon className="h-3 w-3 text-[var(--brand-blue)]" />
        ) : (
          <Sun className="h-3 w-3 text-[var(--brand-blue)]" />
        )}
      </span>
    </button>
  );
}
