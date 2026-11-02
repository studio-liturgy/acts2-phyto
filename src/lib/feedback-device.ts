// Device details on the phytoexp feedback form (test build only). The form
// pre-selects a device type and pre-fills the system and browser from the
// user agent; iOS never reveals the phone model, so the tester adds it.

export const FEEDBACK_DEVICES = ["Phone", "Tablet", "Computer"] as const;
export type FeedbackDevice = (typeof FEEDBACK_DEVICES)[number];

function browserName(ua: string): string {
  if (/EdgiOS|EdgA|Edg\//.test(ua)) return "Edge";
  if (/FxiOS|Firefox\//.test(ua)) return "Firefox";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/OPR\/|OPiOS/.test(ua)) return "Opera";
  if (/CriOS|Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "";
}

function systemName(ua: string, touch: boolean): string {
  const ios = ua.match(/(?:iPhone|iPad|CPU) OS (\d+)/);
  if (ios && /iPhone|iPad|iPod/.test(ua)) return `iOS ${ios[1]}`;
  if (/Macintosh/.test(ua) && touch) return "iPadOS";
  const android = ua.match(/Android (\d+)/);
  if (android) return `Android ${android[1]}`;
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "";
}

/**
 * Best guess at the device type and a "system, browser" line from a user
 * agent. `touch` is navigator.maxTouchPoints > 1: iPadOS reports itself as a
 * Mac, and only touch support tells them apart.
 */
export function guessDevice(ua: string, touch = false): { device: FeedbackDevice; detail: string } {
  let device: FeedbackDevice = "Computer";
  if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua))) device = "Phone";
  else if (/iPad|Android|Tablet/.test(ua) || (/Macintosh/.test(ua) && touch)) device = "Tablet";
  const detail = [systemName(ua, touch), browserName(ua)].filter(Boolean).join(", ");
  return { device, detail };
}
