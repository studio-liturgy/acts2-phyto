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
 * (user_metadata, so every browser it signs in on), never in the app.
 */
export function AppStoreBanner() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const user = useAuthStore((s) => s.session?.user ?? null);
  // Read after mount: the server can't tell the app from a browser.
  const [nativeApp, setNativeApp] = useState(true);
  useEffect(() => setNativeApp(isNativeApp()), []);
  // Closed here: hidden at once, before the account update comes back.
  const [closed, setClosed] = useState(false);

  const dismissed = closed || user?.user_metadata?.[APP_BANNER_DISMISSED_KEY] === true;
  if (!showAppStoreBanner({ pathname, signedIn: !!user, nativeApp, dismissed })) return null;

  const close = () => {
    setClosed(true);
    void supabase.auth.updateUser({ data: { [APP_BANNER_DISMISSED_KEY]: true } });
  };

  return (
    <div
      role="region"
      aria-label="phyto on the App Store"
      className="fixed inset-x-0 top-0 z-50 bg-[var(--brand-blue)] pt-[env(safe-area-inset-top,0px)] text-[var(--brand-white)]"
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
