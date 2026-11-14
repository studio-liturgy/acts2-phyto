import { useEffect, useState } from "react";
import { create } from "zustand";

/**
 * Present from this device (the phyto app): the phone drives its own live
 * slides, with the Remote's controls, and the app shows them on a TV or
 * projector connected by AirPlay or a cable.
 *
 * Native side (studio-liturgy/phyto-app, ExternalDisplayPlugin.swift): when
 * iOS connects an external display, the app opens a second web view on it at
 * /output, which follows this phone's live slide the way the desktop Output
 * window follows the presenter. The plugin reports whether a display is
 * connected, so the controls can show the steps to connect one meanwhile.
 */

type Listener = { remove: () => Promise<void> };
type ExternalDisplayPlugin = {
  status: () => Promise<{ connected: boolean }>;
  addListener: (
    event: "change",
    cb: (data: { connected: boolean }) => void,
  ) => Promise<Listener> | Listener;
};

function plugin(): ExternalDisplayPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as unknown as {
      Capacitor?: {
        Plugins?: { ExternalDisplay?: ExternalDisplayPlugin };
        registerPlugin?: (name: string) => ExternalDisplayPlugin;
        isPluginAvailable?: (name: string) => boolean;
      };
    }
  ).Capacitor;
  if (!cap) return null;
  // The app registers it itself (not an npm plugin), so it may be missing
  // from the injected list: ask the bridge for it by name.
  if (cap.Plugins?.ExternalDisplay) return cap.Plugins.ExternalDisplay;
  if (cap.isPluginAvailable && !cap.isPluginAvailable("ExternalDisplay")) return null;
  return cap.registerPlugin?.("ExternalDisplay") ?? null;
}

/** Whether a TV or projector is connected: true / false in the app, null
 *  where there's no way to tell (a browser, or an app build without it). */
export function useExternalDisplay(): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    const p = plugin();
    if (!p) return;
    let alive = true;
    let listener: Listener | null = null;
    p.status()
      .then((s) => alive && setConnected(s.connected))
      .catch(() => {});
    void Promise.resolve(p.addListener("change", (d) => alive && setConnected(d.connected))).then(
      (l) => {
        if (alive) listener = l;
        else void l.remove();
      },
    );
    return () => {
      alive = false;
      void listener?.remove();
    };
  }, []);
  return connected;
}

/** The gathering being presented from this device, if any. Module level, so
 *  leaving the Present tab and coming back keeps it. */
export const useLocalPresent = create<{
  gatheringId: string | null;
  start: (gatheringId: string) => void;
  stop: () => void;
}>((set) => ({
  gatheringId: null,
  start: (gatheringId) => set({ gatheringId }),
  stop: () => set({ gatheringId: null }),
}));
