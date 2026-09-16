// Shrink-to-fit for slide text.
//
// Slides render into a fixed 1920x1080 box that is then transform-scaled to
// whatever container it sits in, so a thumbnail, the presenter preview and the
// live output all lay out identically. That box is `overflow-hidden` and text
// size is a fixed multiple of the template's fontScale, which is fine while a
// slide holds a line or two. Turn the font size up, or paste a long verse, and
// the text overflows the box, and overflow here means words silently cut off on
// the projector.
//
// The fix is a second, content-driven scale applied on top. Because the stage
// box is a fixed size in layout pixels, the ratio computed here is identical in
// every variant: measure once, and the thumbnail agrees with the projector.
//
// Note this scales via a CSS transform rather than shrinking font-size. Font
// size would reflow the text, changing the measurement that produced it, and
// the correction can oscillate. A transform leaves layout untouched, so one
// measure pass is always right.

/** Canonical stage size. Every variant lays out at this size, then scales to fit. */
export const STAGE_W = 1920;
export const STAGE_H = 1080;

/**
 * Floor on the auto-fit. Past this the text is too small to read from the back
 * of a room, and the honest answer is that the slide holds too much: better to
 * clip visibly than to project something nobody can read.
 */
export const FIT_MIN = 0.4;

/**
 * How much to scale a content block so it fits the space available.
 *
 * Returns 1 whenever the content already fits, so a normal one- or two-line
 * slide is untouched and renders exactly as it did before auto-fit existed.
 */
export function fitScale(contentHeight: number, availableHeight: number, min = FIT_MIN): number {
  if (!Number.isFinite(contentHeight) || !Number.isFinite(availableHeight)) return 1;
  if (contentHeight <= 0 || availableHeight <= 0) return 1;
  if (contentHeight <= availableHeight) return 1;
  return Math.max(min, availableHeight / contentHeight);
}

/**
 * Transform origin for the fit scale, matching how the text is positioned in
 * the box. Top-positioned text must shrink towards the top or it drifts away
 * from the edge it was aligned to; centred text shrinks towards the middle.
 */
export function fitOrigin(position: "top" | "centre" | undefined): string {
  return position === "top" ? "top center" : "center center";
}
