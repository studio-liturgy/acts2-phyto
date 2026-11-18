/**
 * The phyto app's launch animation (components/LaunchReveal.tsx), his spec
 * Nov 18: the blurred blue sign-in picture as large blocks that halve in size
 * in steps (12, 24, 48, 96 across) while still grain rises from none to
 * strong, then the white wordmark bursts in at the centre, then everything
 * fades out to reveal the app. Times are milliseconds from the first frame.
 */

/** Blocks across the screen, and when each size starts. The steps lengthen
 *  so the change slows down towards the end. */
export const BLOCK_STEPS: readonly { at: number; across: number }[] = [
  { at: 0, across: 12 },
  { at: 200, across: 24 },
  { at: 500, across: 48 },
  { at: 900, across: 96 },
];

/** Grain rises over the block steps, then holds. */
export const GRAIN_END = 1400;
/** The wordmark bursts in (grows, overshoots slightly, settles). */
export const LOGO_AT = 1400;
export const LOGO_MS = 300;
/** Picture and wordmark fade out together. */
export const FADE_AT = 1700;
export const FADE_MS = 500;
export const LAUNCH_END = FADE_AT + FADE_MS;

/** Played once per app launch: sessionStorage lives as long as the app's web
 *  view, so reloads inside the app don't replay it. */
export const LAUNCH_PLAYED_KEY = "phyto-launch-played";

/** Blocks across at time t (ms). */
export function blocksAcross(t: number): number {
  let across = BLOCK_STEPS[0].across;
  for (const s of BLOCK_STEPS) if (t >= s.at) across = s.across;
  return across;
}

/** Grain strength 0..1 at time t: a smooth ease-in-out rise, then held. */
export function grainAt(t: number): number {
  const x = Math.min(1, Math.max(0, t / GRAIN_END));
  return x * x * (3 - 2 * x);
}

/** Rows of blocks for a box, keeping the blocks square. */
export function blocksDown(across: number, boxW: number, boxH: number): number {
  if (boxW <= 0 || boxH <= 0) return across;
  return Math.max(1, Math.round((across * boxH) / boxW));
}

/** The part of a picture that CSS `background-size: cover;
 *  background-position: center` shows in a box (the sign-in page's crop). */
export function coverCrop(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const sw = boxW / scale;
  const sh = boxH / scale;
  return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
}

/** Whether to play: inside the app, once per launch. */
export function shouldPlayLaunch(
  inApp: boolean,
  storage: Pick<Storage, "getItem"> | null,
): boolean {
  if (!inApp) return false;
  try {
    return storage?.getItem(LAUNCH_PLAYED_KEY) !== "1";
  } catch {
    return true;
  }
}
