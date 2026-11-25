/** phyto on the App Store (Apple ID 6834818764). */
export const APP_STORE_URL = "https://apps.apple.com/app/id6834818764";

/** user_metadata flag: the account closed the App Store banner for good. */
export const APP_BANNER_DISMISSED_KEY = "app_store_banner_dismissed";

/** The App Store banner shows on the home page of a browser (never the app),
 *  to a signed-in account that hasn't closed it. */
export function showAppStoreBanner(opts: {
  pathname: string;
  signedIn: boolean;
  nativeApp: boolean;
  dismissed: boolean;
}): boolean {
  return opts.pathname === "/" && opts.signedIn && !opts.nativeApp && !opts.dismissed;
}
