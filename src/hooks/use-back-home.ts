import { useEffect, useState } from "react";

// Pages opened from the phone's Account tab (Updates, Legal, Feedback, About)
// go Back to that tab, not to Gatherings. Kept per tab in sessionStorage.
const KEY = "phyto:back-to-account";

/** Remember that the next page was opened from the Account tab. */
export function markBackToAccount(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage unavailable: Back goes to the home page.
  }
}

/** Opened from anywhere else: Back goes home as usual. */
export function clearBackToAccount(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The home page's search for a Back link: the Account tab when that's
 *  where this page was opened from. Read after mount (no server mismatch). */
export function useBackHomeSearch(): { tab?: "account" } {
  const [toAccount, setToAccount] = useState(false);
  useEffect(() => {
    try {
      setToAccount(sessionStorage.getItem(KEY) === "1");
    } catch {
      setToAccount(false);
    }
  }, []);
  return toAccount ? { tab: "account" } : {};
}
