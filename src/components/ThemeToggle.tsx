import { useTheme, type ThemeMode } from "@/hooks/use-theme";
import { Sun, Moon, Monitor } from "lucide-react";

const labels: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, toggle } = useTheme();
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={toggle}
      title={`Theme: ${labels[mode]} (click to change)`}
      aria-label={`Theme: ${labels[mode]}`}
      className={`mono inline-flex items-center gap-1.5 text-sm transition-opacity duration-200 hover:opacity-60 ${className}`}
    >
      <Icon className="h-4 w-4" />
      <span>{labels[mode]}</span>
    </button>
  );
}
