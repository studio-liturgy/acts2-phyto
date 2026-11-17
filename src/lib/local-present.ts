import { useEffect, useState } from "react";
import { create } from "zustand";
import { hapticRhythm } from "./haptics";

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
 *  leaving the Present tab and coming back keeps it. While presenting, the TV
 *  connection is watched from here (any tab): his connect rhythm when a TV
 *  connects, the disconnect rhythm when it drops (after the same 2 s grace
 *  the steps page uses, so a blip stays quiet) or when presenting stops. */
export const useLocalPresent = create<{
  gatheringId: string | null;
  start: (gatheringId: string) => void;
  stop: () => void;
}>((set) => ({
  gatheringId: null,
  start: (gatheringId) => {
    set({ gatheringId });
    startTvWatch();
  },
  stop: () => {
    stopTvWatch(true);
    set({ gatheringId: null });
  },
}));

/** A TV drop only counts after this long (matches the steps page). */
export const TV_DROP_GRACE_MS = 2000;

type TvWatch = {
  listener: Listener | null;
  dropTimer: ReturnType<typeof setTimeout> | null;
  /** The connection as counted (drops only after the grace). */
  connected: boolean;
  alive: boolean;
};

let tvWatch: TvWatch | null = null;

function startTvWatch() {
  if (tvWatch) return;
  const p = plugin();
  if (!p) return;
  const w: TvWatch = {
    listener: null,
    dropTimer: null,
    connected: false,
    alive: true,
  };
  tvWatch = w;
  const seen = (connected: boolean) => {
    if (!w.alive) return;
    if (connected) {
      if (w.dropTimer) clearTimeout(w.dropTimer);
      w.dropTimer = null;
      if (!w.connected) {
        w.connected = true;
        hapticRhythm("connect");
      }
    } else if (w.connected && !w.dropTimer) {
      w.dropTimer = setTimeout(() => {
        w.dropTimer = null;
        if (!w.alive || !w.connected) return;
        w.connected = false;
        hapticRhythm("disconnect");
      }, TV_DROP_GRACE_MS);
    }
  };
  p.status()
    .then((s) => seen(s.connected))
    .catch(() => {});
  void Promise.resolve(p.addListener("change", (d) => seen(d.connected))).then((l) => {
    if (w.alive) w.listener = l;
    else void l.remove();
  });
}

function stopTvWatch(buzz: boolean) {
  const w = tvWatch;
  if (!w) return;
  tvWatch = null;
  w.alive = false;
  if (w.dropTimer) clearTimeout(w.dropTimer);
  void w.listener?.remove();
  if (buzz && w.connected) hapticRhythm("disconnect");
}
