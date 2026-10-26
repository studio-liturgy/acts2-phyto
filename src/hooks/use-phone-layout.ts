import { useLayoutEffect, useState } from "react";
import { PHONE_QUERY, PHONE_UI } from "@/lib/phone-layout";

/**
 * True on a phone-sized screen (when the phone layout exists in this build),
 * false on desktop and tablets, and null until the screen is known (server
 * render and the first client render), so a page can hold off instead of
 * flashing the wrong layout. Measured in a layout effect, before the first
 * paint. A plain effect rather than useSyncExternalStore keeps the server
 * render the same as before the phone layout.
 */
export function usePhoneLayout(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(PHONE_UI ? null : false);
  useLayoutEffect(() => {
    if (!PHONE_UI) return;
    const mql = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return phone;
}
