import { useRef, type CSSProperties } from "react";
import { rangeGesture, rangeValueAt, type RangeGesture } from "@/lib/range-tap";

/** The app's range slider, with a finger-sized hit area and tap-to-jump on
 *  touch: a tap anywhere on the bar moves the value there, a sideways drag
 *  from anywhere on the bar follows the finger, and an up/down swipe still
 *  scrolls the page. Mouse keeps the browser's own behaviour (a click on the
 *  track already jumps). Looks the same as a plain range (`.tap-range` in
 *  styles.css only adds invisible height). */
export function TapRange({
  min,
  max,
  step,
  value,
  onValue,
  className = "",
  style,
  ...aria
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onValue: (v: number) => void;
  className?: string;
  style?: CSSProperties;
  title?: string;
  "aria-label"?: string;
}) {
  const onValueRef = useRef(onValue);
  onValueRef.current = onValue;

  const onPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (e.pointerType === "mouse") return;
    const el = e.currentTarget;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let state: RangeGesture = "pending";
    const valueAt = (x: number) => {
      const r = el.getBoundingClientRect();
      return rangeValueAt(x, r.left, r.width, min, max, step);
    };
    // Window listeners, not pointer capture: they always see the end.
    const move = (ev: PointerEvent) => {
      if (state === "scroll") return;
      if (state === "pending") state = rangeGesture(x0, y0, ev.clientX, ev.clientY);
      if (state === "drag") onValueRef.current(valueAt(ev.clientX));
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (ev.type === "pointerup" && state === "pending") onValueRef.current(valueAt(ev.clientX));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValue(Number(e.target.value))}
      onPointerDown={onPointerDown}
      className={`tap-range ${className}`}
      style={style}
      {...aria}
    />
  );
}
