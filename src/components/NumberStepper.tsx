import { Minus, Plus } from "lucide-react";

/**
 * The small numeric control used across the editor and presenter.
 *
 * A native number input's spinner can't be restyled beyond hiding it, so it's
 * replaced outright with buttons matching the rest of the app's pill controls.
 * This started life inline as the set editor's "lines per slide" control; the
 * presenter's dissolve and auto-advance fields now share it, which is the whole
 * point — three numeric settings that looked like three different widgets.
 */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  format,
  decrementLabel,
  incrementLabel,
  boxClassName = "w-6",
  small = false,
}: {
  /** The phone's height: 24px, the same as a PillSwitch beside it. */
  small?: boolean;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Also sets the rounding precision, so 0.1 steps don't drift into 0.30000000000000004. */
  step?: number;
  /** How the value reads in the box. Defaults to the bare number. */
  format?: (n: number) => string;
  decrementLabel: string;
  incrementLabel: string;
  /** Widen the value box when the formatted value needs more room than one digit. */
  boxClassName?: string;
}) {
  const decimals = (String(step).split(".")[1] ?? "").length;
  const clamp = (n: number) =>
    Number(Math.min(max, Math.max(min, Number.isFinite(n) ? n : min)).toFixed(decimals));

  return (
    <div
      className={`pill flex items-stretch overflow-hidden border border-foreground bg-background ${small ? "h-6" : "h-7"}`}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label={decrementLabel}
        className={`flex items-center justify-center transition hover:bg-foreground hover:text-background disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit ${small ? "w-5" : "w-6"}`}
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={format ? format(value) : String(value)}
        // Typed text is filtered rather than validated: the box may be showing a
        // word like "OFF", and stripping to digits means typing over it just works.
        onChange={(e) => onChange(clamp(Number(e.target.value.replace(/[^\d.]/g, ""))))}
        className={`mono min-h-0 appearance-none border-x border-foreground bg-transparent p-0 text-center outline-none ${small ? "h-full text-[10px] leading-none" : "text-xs"} ${boxClassName}`}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label={incrementLabel}
        className={`flex items-center justify-center transition hover:bg-foreground hover:text-background disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit ${small ? "w-5" : "w-6"}`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
