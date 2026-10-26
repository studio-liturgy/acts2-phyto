import { useEffect, useState } from "react";

// Pages opened from the phone's Settings tab (Updates, Legal, Feedback, About)
// go Back to that tab, not to Gatherings. Kept per tab in sessionStorage.
const KEY = "phyto:back-to-settings";

/** Remember that the next page was opened from the Settings tab. */
export function markBackToSettings(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage unavailable: Back goes to the home page.
  }
}

/** Opened from anywhere else: Back goes home as usual. */
export function clearBackToSettings(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The home page's search for a Back link: the Settings tab when that's
 *  where this page was opened from. Read after mount (no server mismatch). */
export function useBackHomeSearch(): { tab?: "settings" } {
  const [toSettings, setToSettings] = useState(false);
  useEffect(() => {
    try {
      setToSettings(sessionStorage.getItem(KEY) === "1");
    } catch {
      setToSettings(false);
    }
  }, []);
  return toSettings ? { tab: "settings" } : {};
}
