// Present from a phone (n133): what kind of device opened the screen link,
// for its pop-up. iPhones and iPads get Add to Home Screen (opened from the
// home screen, Safari's bars are gone, so AirPlay mirrors only the slides);
// computers get Close only, which also goes full screen. iPads in Safari
// claim to be a Mac, so a touch screen on a "Mac" counts as an iPad.

export type ScreenDevice = "ios" | "android" | "computer";

export function screenDevice(userAgent: string, maxTouchPoints: number): ScreenDevice {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "computer";
}

/** A phone or tablet (no full screen; may be held upright). */
export function isHandheld(d: ScreenDevice): boolean {
  return d !== "computer";
}
