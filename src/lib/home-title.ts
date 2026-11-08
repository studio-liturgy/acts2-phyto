import { APP_NAME } from "@/lib/appConfig";
import type { PhoneTab } from "@/lib/phone-layout";

/** The home page's server-rendered title: what search engines and link previews see. */
export const HOME_SEO_TITLE = `${APP_NAME}: free worship presentation for gatherings at home`;

const PHONE_TAB_NAME: Record<PhoneTab, string> = {
  gatherings: "Gatherings",
  catalogue: "Catalogue",
  settings: "Settings",
};

/**
 * The browser tab title for the home page. Signed out, or on the intro page,
 * it keeps the long SEO title. Signed in, it reads like the other app pages
 * ("Set Editor | phyto"): "Home | phyto" on desktop, the bottom tab's name
 * on the phone home.
 */
export function homeTitle(opts: {
  signedIn: boolean;
  landing: boolean;
  phoneTab: PhoneTab | null;
}): string {
  if (!opts.signedIn || opts.landing) return HOME_SEO_TITLE;
  const page = opts.phoneTab ? PHONE_TAB_NAME[opts.phoneTab] : "Home";
  return `${page} | ${APP_NAME}`;
}
