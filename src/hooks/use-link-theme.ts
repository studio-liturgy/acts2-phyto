import { useEffect } from "react";
import { loadPrefs } from "@/lib/phone-viewer";

/**
 * Screens opened from a live link's Edit (the gathering and the sets edited
 * from it) wear the link viewer's light or dark while mounted, then hand the
 * page back to the app's own theme.
 */
export function useLinkTheme(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const was = html.classList.contains("dark");
    html.classList.toggle("dark", loadPrefs().isDark);
    return () => {
      html.classList.toggle("dark", was);
    };
  }, [active]);
}
