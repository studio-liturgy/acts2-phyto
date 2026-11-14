import { useEffect } from "react";

type KeepAwake = { keepAwake: () => Promise<void>; allowSleep: () => Promise<void> };

/** The phyto app's Keep Awake plugin, through the Capacitor bridge. */
function keepAwakePlugin(): KeepAwake | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: { KeepAwake?: KeepAwake } } })
    .Capacitor;
  return cap?.Plugins?.KeepAwake ?? null;
}

/** Keep the screen from sleeping while the page is showing (the screen link,
 *  and the phone while it is a remote or presents). In the phyto app the
 *  native Keep Awake plugin does it; in a browser, the Screen Wake Lock API. */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const native = keepAwakePlugin();
    if (native) {
      void native.keepAwake().catch(() => {});
      return () => {
        void native.allowSleep().catch(() => {});
      };
    }
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
