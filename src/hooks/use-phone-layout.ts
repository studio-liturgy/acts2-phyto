import { useSyncExternalStore } from "react";
import { PHONE_QUERY, PHONE_UI } from "@/lib/phone-layout";

function subscribe(cb: () => void) {
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

/**
 * True on a phone-sized screen (when the phone layout exists in this build),
 * false on desktop and tablets, and null until the screen is known (server
 * render and hydration), so a page can hold off instead of flashing the
 * wrong layout.
 */
export function usePhoneLayout(): boolean | null {
  return useSyncExternalStore(
    PHONE_UI ? subscribe : () => () => {},
    () => (PHONE_UI ? window.matchMedia(PHONE_QUERY).matches : false),
    () => (PHONE_UI ? null : false),
  );
}
