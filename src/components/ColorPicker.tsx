import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from "@/lib/color";

/**
 * A colour picker in phyto's look, opened from a swatch: a saturation /
 * brightness square, a hue slider and a hex field, in a rounded bordered
 * popover. Changes apply as they're made. Replaces the browser's own picker,
 * which can't be styled.
 */
export function ColorPicker({
  value,
  onChange,
  trigger,
}: {
  value: string;
  onChange: (hex: string) => void;
  /** The swatch that opens it. */
  trigger: React.ReactNode;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value);
  // Follow outside changes (a preset picked) without fighting a drag: only
  // when the colour shown differs from the value.
  useEffect(() => {
    if (hsvToHex(hsv) !== normalizeHex(value)) setHsv((cur) => hexToHsv(value, cur.h));
    setHexDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const apply = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexDraft(hex);
    onChange(hex);
  };

  const square = useRef<HTMLDivElement>(null);
  const hue = useRef<HTMLDivElement>(null);
  const drag =
    (el: React.RefObject<HTMLDivElement | null>, at: (x: number, y: number) => void) =>
    (e: React.PointerEvent) => {
      const box = el.current;
      if (!box) return;
      box.setPointerCapture(e.pointerId);
      const move = (ev: { clientX: number; clientY: number }) => {
        const r = box.getBoundingClientRect();
        at(
          Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
          Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
        );
      };
      move(e);
      const up = () => {
        box.removeEventListener("pointermove", move);
        box.removeEventListener("pointerup", up);
      };
      box.addEventListener("pointermove", move);
      box.addEventListener("pointerup", up);
    };

  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-60 space-y-3 rounded-2xl border border-foreground bg-background p-3"
      >
        {/* Saturation left to right, brightness bottom to top. */}
        <div
          ref={square}
          onPointerDown={drag(square, (x, y) => apply({ ...hsv, s: x, v: 1 - y }))}
          className="relative h-36 w-full cursor-crosshair touch-none overflow-hidden rounded-lg"
          style={{
            backgroundColor: pure,
            backgroundImage:
              "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
          }}
        >
          <span
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
          />
        </div>

        <div
          ref={hue}
          onPointerDown={drag(hue, (x) => apply({ ...hsv, h: x * 360 }))}
          className="relative h-3 w-full cursor-pointer touch-none rounded-full"
          style={{
            background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: pure }}
          />
        </div>

        <div className="flex items-center gap-2">
          <span
            className="h-6 w-6 shrink-0 rounded-full border border-foreground/20"
            style={{ backgroundColor: hsvToHex(hsv) }}
          />
          <input
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value);
              const hex = normalizeHex(e.target.value);
              if (hex) {
                setHsv((cur) => hexToHsv(hex, cur.h));
                onChange(hex);
              }
            }}
            spellCheck={false}
            aria-label="Hex colour"
            className="mono w-full rounded-full border border-foreground/20 bg-transparent px-3 py-1 text-xs uppercase tracking-wider outline-none focus:border-foreground"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
