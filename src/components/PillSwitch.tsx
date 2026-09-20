/**
 * The app's switch: the same pill as the light/dark toggle (an outlined track
 * with a solid knob that slides right when on), without an icon. Used wherever
 * a setting is on/off so every toggle reads the same.
 */
export function PillSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  className = "",
}: {
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  disabled?: boolean;
  /** Accessible name. */
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-current/40 bg-transparent transition-opacity duration-200 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <span
        className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-current transition-all duration-200"
        style={{ left: checked ? "calc(100% - 1.25rem - 2px)" : "2px" }}
      />
    </button>
  );
}
