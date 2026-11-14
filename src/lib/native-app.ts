/**
 * Running inside the phyto iOS / Android app (a Capacitor shell that loads
 * the website).
 *
 * The app adds `phyto-app/ios` or `phyto-app/android` to the web view's user
 * agent (capacitor.config `appendUserAgent`). A small script in <head>
 * (`nativeAppInitScript`, __root.tsx) copies it onto <html data-native-app>
 * before the first paint, so CSS can hide things in the app with no flash
 * (`[data-giving]`, styles.css) and code reads it with `nativePlatform()`.
 *
 * Test builds only: opening phytoexp.live with `?app=ios` (or `?app=android`)
 * acts as the app for the rest of the tab (sessionStorage), so the app's
 * screens can be checked in a phone browser before the app exists.
 * `?app=off` ends it.
 */

export type NativePlatform = "ios" | "android";

const isTest = import.meta.env.VITE_APP_ENV === "test";

/** sessionStorage key for the test-only `?app=` stand-in. */
export const APP_SIM_KEY = "phyto-app-sim";

/** The platform named in a user agent, or null for a plain browser. */
export function nativePlatformFromUA(ua: string): NativePlatform | null {
  const m = /\bphyto-app\/(ios|android)\b/i.exec(ua);
  return m ? (m[1].toLowerCase() as NativePlatform) : null;
}

/** Reads `?app=` (test builds): the platform to act as, "off", or null when absent. */
export function appSimParam(search: string): NativePlatform | "off" | null {
  const v = new URLSearchParams(search).get("app");
  if (v === "ios" || v === "android" || v === "off") return v;
  return null;
}

/** Inline <head> script: sets <html data-native-app="ios|android">. */
export const nativeAppInitScript = `(function(){try{var d=document.documentElement;var m=/\\bphyto-app\\/(ios|android)\\b/i.exec(navigator.userAgent);var p=m?m[1].toLowerCase():null;${
  isTest
    ? `var q=new URLSearchParams(location.search).get('app');if(q==='off'){sessionStorage.removeItem('${APP_SIM_KEY}');}else if(q==='ios'||q==='android'){sessionStorage.setItem('${APP_SIM_KEY}',q);}if(!p){var s=sessionStorage.getItem('${APP_SIM_KEY}');if(s==='ios'||s==='android')p=s;}`
    : ""
}if(p)d.setAttribute('data-native-app',p);}catch(e){}})();`;

/** The app's platform on this page, or null in a browser (and during SSR). */
export function nativePlatform(): NativePlatform | null {
  if (typeof document === "undefined") return null;
  const v = document.documentElement.getAttribute("data-native-app");
  return v === "ios" || v === "android" ? v : null;
}

/** True inside the phyto app. */
export function isNativeApp(): boolean {
  return nativePlatform() !== null;
}

/** An iPad browser: iPadOS Safari reports a Mac, so a touch screen on a "Mac"
 *  means an iPad (Macs have no touch screen). Never true inside the app. */
export function isIpadBrowser(
  ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
  maxTouchPoints: number = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
): boolean {
  if (nativePlatformFromUA(ua)) return false;
  if (/\biPad\b/.test(ua)) return true;
  return /\bMacintosh\b/.test(ua) && maxTouchPoints > 1;
}

/** Inside the real app (not the `?app=` stand-in): registers the offline cache
 *  (public/sw.js) and asks it to fetch any files a new build added. */
export function registerAppServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (!nativePlatformFromUA(navigator.userAgent)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => (reg.active ?? reg.waiting ?? reg.installing)?.postMessage("phyto-sw-refresh"))
    .catch(() => {});
}

/** The phyto app keeps its launch screen up until the page has drawn
 *  (capacitor.config SplashScreen, launchShowDuration as a fallback), so the
 *  first launch never sits on a blank web view. */
export function hideAppSplash(): void {
  if (typeof window === "undefined") return;
  const cap = (
    window as unknown as {
      Capacitor?: {
        Plugins?: { SplashScreen?: { hide: (o?: { fadeOutDuration?: number }) => Promise<void> } };
      };
    }
  ).Capacitor;
  void cap?.Plugins?.SplashScreen?.hide({ fadeOutDuration: 250 }).catch(() => {});
}
