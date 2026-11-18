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

// Terms and Privacy opened from the sign-in page: Back returns there.
const LOGIN_KEY = "phyto:back-to-login";

/** Remember that Terms or Privacy was opened from the sign-in page. */
export function markBackToLogin(): void {
  try {
    sessionStorage.setItem(LOGIN_KEY, "1");
  } catch {
    // Storage unavailable: Back goes to the home page.
  }
}

/** Back on the sign-in page (or anywhere else): forget it. */
export function clearBackToLogin(): void {
  try {
    sessionStorage.removeItem(LOGIN_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Whether Back on Terms or Privacy should return to the sign-in page. */
export function useBackToLogin(): boolean {
  const [toLogin, setToLogin] = useState(false);
  useEffect(() => {
    try {
      setToLogin(sessionStorage.getItem(LOGIN_KEY) === "1");
    } catch {
      setToLogin(false);
    }
  }, []);
  return toLogin;
}
