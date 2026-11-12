import { useEffect } from "react";

/** Keep the screen from sleeping while the page is showing (the screen link,
 *  and the phone while it is a remote). */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    type Lock = { release: () => Promise<void> };
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } })
      .wakeLock;
    if (!wl) return;
    let lock: Lock | null = null;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      wl.request("screen")
        .then((l) => {
          lock = l;
        })
        .catch(() => {});
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
}
