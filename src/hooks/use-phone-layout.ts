import { useLayoutEffect, useState } from "react";
import { PHONE_QUERY, PHONE_UI, TABLET_DESKTOP_QUERY, phoneLayoutFor } from "@/lib/phone-layout";
import { isTablet } from "@/lib/native-app";

/**
 * True on a phone-sized screen (when the phone layout exists in this build),
 * false on desktop and tablets, and null until the screen is known (server
 * render and the first client render), so a page can hold off instead of
 * flashing the wrong layout. Measured in a layout effect, before the first
 * paint. A plain effect rather than useSyncExternalStore keeps the server
 * render the same as before the phone layout.
 *
 * Tablets keep the desktop layout down to TABLET_MIN_DESKTOP (an upright
 * iPad mini); only a Split View or Slide Over narrower than that gets the
 * phone layout (`phoneLayoutFor`).
 */
export function usePhoneLayout(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(PHONE_UI ? null : false);
  useLayoutEffect(() => {
    if (!PHONE_UI) return;
    const tablet = isTablet();
    const phoneMql = window.matchMedia(PHONE_QUERY);
    const tabletMql = window.matchMedia(TABLET_DESKTOP_QUERY);
    const update = () => setPhone(phoneLayoutFor(window.innerWidth, tablet));
    update();
    phoneMql.addEventListener("change", update);
    tabletMql.addEventListener("change", update);
    return () => {
      phoneMql.removeEventListener("change", update);
      tabletMql.removeEventListener("change", update);
    };
  }, []);
  return phone;
}
