// Colour maths for the custom colour picker (components/ColorPicker.tsx):
// hex <-> HSV, where the picker's square is saturation x value and its slider
// is hue.

export type Hsv = { h: number; s: number; v: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** "#2e7299" from h 0-360, s/v 0-1. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return (
    "#" +
    [f(5), f(3), f(1)]
      .map((c) =>
        Math.round(clamp(c, 0, 1) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** A hex colour ("#abc", "abc", "#aabbcc") as #rrggbb in lower case, or null. */
export function normalizeHex(input: string): string | null {
  const m = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(m))
    return (
      "#" +
      m
        .split("")
        .map((c) => c + c)
        .join("")
    );
  if (/^[0-9a-f]{6}$/.test(m)) return "#" + m;
  return null;
}

/** HSV for a hex colour; black for anything unreadable. Greys keep `keepHue`
 *  so the hue slider doesn't jump when the square is dragged to an edge. */
export function hexToHsv(hex: string, keepHue = 0): Hsv {
  const n = normalizeHex(hex) ?? "#000000";
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = keepHue;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
