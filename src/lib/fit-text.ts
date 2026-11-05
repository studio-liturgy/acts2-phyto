/**
 * The font size that makes one line of text exactly `available` px wide,
 * given its width `measured` at `size`. Text width scales with font size, so
 * this is a straight ratio, held between `min` and `max`.
 */
export function fitFontSize(
  size: number,
  measured: number,
  available: number,
  { min = 8, max = 16 }: { min?: number; max?: number } = {},
): number {
  if (!(measured > 0) || !(available > 0)) return size;
  const fit = (size * available) / measured;
  return Math.min(max, Math.max(min, Math.floor(fit * 100) / 100));
}
