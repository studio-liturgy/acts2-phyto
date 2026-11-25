import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { useAuthStore } from "@/lib/authStore";
import { supabase } from "@/lib/supabase";
import { isNativeApp } from "@/lib/native-app";
import { APP_BANNER_DISMISSED_KEY, APP_STORE_URL, showAppStoreBanner } from "@/lib/app-store";

/**
 * "phyto is now on the App Store for iPhone." across the top of the home page
 * in a browser, for signed-in accounts. X closes it for good on that account
 * (user_metadata, so every browser it signs in on, checked fresh from the
 * server on load), never in the app.
 *
 * It sits in the page, pushing it down (the desktop home and the phone
 * screen place it first). While it shows, <html data-app-banner> lets the
 * phone header drop its own notch gap: the banner already clears the notch.
 */
/** This browser already knows the account closed it (no wait, no flash). */
function closedHere(userId: string): boolean {
  try {
    return localStorage.getItem(`${CLOSED_HERE_KEY}:${userId}`) === "1";
  } catch {
    return false;
  }
}
function rememberClosedHere(userId: string): void {
  try {
    localStorage.setItem(`${CLOSED_HERE_KEY}:${userId}`, "1");
  } catch {
    // Storage unavailable: the account flag still covers it.
  }
}
const CLOSED_HERE_KEY = "phyto:app-banner-closed";

export function AppStoreBanner() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const user = useAuthStore((s) => s.session?.user ?? null);
  const userId = user?.id ?? null;
  // Read after mount: the server can't tell the app from a browser.
  const [nativeApp, setNativeApp] = useState(true);
  useEffect(() => setNativeApp(isNativeApp()), []);
  // Closed here: hidden at once, before the account update comes back.
  const [closed, setClosed] = useState(false);
  // The account as the server has it now. The signed-in session keeps the
  // user_metadata it had at sign in (until its token refreshes), so a close
  // on another device wouldn't show in it: the banner waits for this check.
  const [serverDismissed, setServerDismissed] = useState<boolean | null>(null);

  const candidate =
    !!userId &&
    !closed &&
    !closedHere(userId) &&
    user?.user_metadata?.[APP_BANNER_DISMISSED_KEY] !== true &&
    showAppStoreBanner({ pathname, signedIn: true, nativeApp, dismissed: false });

  useEffect(() => {
    if (!candidate || !userId) return;
    let live = true;
    setServerDismissed(null);
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!live) return;
      // Can't reach the server: stay hidden rather than show a closed banner.
      if (error || !data.user) return;
      const done = data.user.user_metadata?.[APP_BANNER_DISMISSED_KEY] === true;
      if (done) rememberClosedHere(userId);
      setServerDismissed(done);
    });
    return () => {
      live = false;
    };
  }, [candidate, userId]);

  const show = candidate && serverDismissed === false;
  useEffect(() => {
    if (!show) return;
    const html = document.documentElement;
    html.setAttribute("data-app-banner", "");
    return () => html.removeAttribute("data-app-banner");
  }, [show]);
  if (!show || !userId) return null;

  const close = () => {
    setClosed(true);
    rememberClosedHere(userId);
    void supabase.auth.updateUser({ data: { [APP_BANNER_DISMISSED_KEY]: true } });
  };

  return (
    <div
      role="region"
      aria-label="phyto on the App Store"
      className="shrink-0 bg-[var(--brand-blue)] pt-[env(safe-area-inset-top,0px)] text-[var(--brand-white)]"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
        <p className="mono flex-1 text-xs uppercase tracking-wider">
          phyto is now on the App Store for iPhone.{" "}
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 transition-opacity hover:opacity-60"
          >
            Get the app
          </a>
        </p>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="shrink-0 transition-opacity hover:opacity-60"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
