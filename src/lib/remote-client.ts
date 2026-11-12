// Present from a phone (n133): the remote's connection to the screen room.
// Held at module level (not in a component), so switching tabs on the phone
// keeps the screen connected. Sends the live gathering once per connect (only
// sets the room doesn't already hold), then each live change as it happens,
// and keeps the room up to date as sets, templates and Background change.

import { create } from "zustand";
import { supabase } from "./supabase";
import { useLibrary, useLive } from "./store";
import {
  parseMessage,
  reconnectDelay,
  roomPath,
  splitSet,
  contentHash,
  type RemoteLive,
  type RemoteMeta,
  type RemoteToRoom,
  type RoomToRemote,
} from "./remote-protocol";
import { isLiveNow } from "./live-session";
import type { LiveState } from "./types";

export type RemoteStatus =
  /** Not started (the Remote button). */
  | "idle"
  /** Connecting, or reconnecting after a drop. */
  | "connecting"
  /** Connected; no screen has joined yet (the QR code and link). */
  | "waiting"
  /** At least one screen is showing the slides (the controls). When the
   *  last one closes, it goes back to "waiting". */
  | "connected"
  /** The room refused this login (not this account's or group's link). */
  | "denied";

interface RemoteStore {
  status: RemoteStatus;
  /** Screens connected right now. */
  screens: number;
  /** This phone is reconnecting after a drop (the controls stay, marked as
   *  reconnecting). */
  reconnecting: boolean;
  slug: string | null;
  gatheringId: string | null;
  start: (gatheringId: string, slug: string) => void;
  /** Disconnect: the screens go back to "Looking for remote...". */
  stop: () => void;
}

let ws: WebSocket | null = null;
let attempts = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let unsubs: (() => void)[] = [];
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectingTimer: ReturnType<typeof setTimeout> | null = null;
let screensGoneTimer: ReturnType<typeof setTimeout> | null = null;
/** What the room holds: set id -> content hash. */
let roomHas: Record<string, string> = {};
let lastMeta = "";
let lastLive = "";
/** Set objects already hashed (the store hands over the same object until a
 *  set changes, so most syncs skip the stringify). */
const hashed = new WeakMap<object, string>();

function sendMsg(m: RemoteToRoom) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function liveOf(s: LiveState): RemoteLive {
  return {
    setId: s.setId,
    slideId: s.slideId,
    slideOcc: s.slideOcc ?? 0,
    blackout: s.blackout,
    clear: s.clear,
    blackoutFadeMs: s.blackoutFadeMs,
    videoCmd: s.videoCmd,
    videoEnded: s.videoEnded,
    refresh: s.refresh,
  };
}

/** Send whatever about the gathering changed since the room last heard. */
function syncDeck() {
  const gid = useRemote.getState().gatheringId;
  const lib = useLibrary.getState();
  const g = gid ? lib.gatherings[gid] : null;
  // The session ended (or the gathering is gone): the remote disconnects and
  // the screens go back to waiting.
  if (gid && (!g || (g.is_live !== null && !isLiveNow(g)))) {
    useRemote.getState().stop();
    return;
  }
  if (!g || ws?.readyState !== WebSocket.OPEN) return;
  const meta: RemoteMeta = {
    gatheringId: g.id,
    setIds: g.setIds,
    songTemplate: lib.songTemplate,
    scriptureTemplate: lib.scriptureTemplate,
    background: lib.background,
    fadeMs: lib.fadeMs,
  };
  const metaJson = JSON.stringify(meta);
  if (metaJson !== lastMeta) {
    lastMeta = metaJson;
    sendMsg({ t: "meta", meta });
  }
  for (const id of new Set(g.setIds)) {
    const d = lib.sets[id];
    if (!d) continue;
    let v = hashed.get(d);
    if (!v) {
      v = contentHash(JSON.stringify(d));
      hashed.set(d, v);
    }
    if (roomHas[id] === v) continue;
    for (const p of splitSet(d)) sendMsg(p);
    roomHas[id] = v;
  }
}

function scheduleSync() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncDeck();
  }, 300);
}

function syncLive(force = false) {
  const live = liveOf(useLive.getState());
  const json = JSON.stringify(live);
  if (!force && json === lastLive) return;
  lastLive = json;
  sendMsg({ t: "live", live });
}

function stopTimers() {
  if (retryTimer) clearTimeout(retryTimer);
  if (pingTimer) clearInterval(pingTimer);
  if (syncTimer) clearTimeout(syncTimer);
  retryTimer = pingTimer = syncTimer = null;
}

function connect() {
  const { slug } = useRemote.getState();
  if (!slug || typeof window === "undefined") return;
  stopTimers();
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const sock = new WebSocket(`${proto}//${window.location.host}${roomPath(slug, "remote")}`);
  ws = sock;
  useRemote.setState((s) => ({ status: s.status === "connected" ? s.status : "connecting" }));
  sock.onopen = async () => {
    const { data } = await supabase.auth.getSession();
    if (ws !== sock) return;
    sendMsg({ t: "auth", token: data.session?.access_token ?? "" });
  };
  sock.onmessage = (e) => {
    if (ws !== sock) return;
    const m = parseMessage<RoomToRemote>(e.data);
    if (!m) return;
    if (m.t === "auth") {
      if (!m.ok) {
        useRemote.setState({ status: "denied" });
        return;
      }
      attempts = 0;
      pingTimer = setInterval(
        () => sock.readyState === WebSocket.OPEN && sock.send("ping"),
        25_000,
      );
    } else if (m.t === "have") {
      roomHas = { ...m.sets };
      lastMeta = "";
      syncDeck();
      syncLive(true);
      if (reconnectingTimer) clearTimeout(reconnectingTimer);
      reconnectingTimer = null;
      useRemote.setState({ reconnecting: false });
    } else if (m.t === "screens") {
      // The last screen closed: back to the link page, unless it's only a
      // blip (the screen reconnecting) that comes back within a few seconds.
      if (screensGoneTimer) clearTimeout(screensGoneTimer);
      screensGoneTimer = null;
      if (m.n > 0) {
        useRemote.setState({ screens: m.n, status: "connected" });
      } else if (useRemote.getState().status === "connected") {
        useRemote.setState({ screens: 0 });
        screensGoneTimer = setTimeout(() => {
          screensGoneTimer = null;
          if (useRemote.getState().screens === 0 && useRemote.getState().status === "connected") {
            useRemote.setState({ status: "waiting" });
          }
        }, 4000);
      } else {
        useRemote.setState({ screens: 0, status: "waiting" });
      }
    } else if (m.t === "ended") {
      const live = useLive.getState();
      if (live.videoCmd?.nonce === m.nonce && !live.videoEnded) live.videoFinished();
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    stopTimers();
    const s = useRemote.getState();
    if (s.status === "idle" || s.status === "denied") return;
    // A quick reconnect (the usual case) never shows "Reconnecting".
    if (!reconnectingTimer) {
      reconnectingTimer = setTimeout(() => useRemote.setState({ reconnecting: true }), 2500);
    }
    // First retry almost at once, then back off.
    const wait = attempts === 0 ? 250 : reconnectDelay(attempts - 1);
    attempts++;
    retryTimer = setTimeout(connect, wait);
  };
}

function onVisible() {
  if (document.visibilityState !== "visible") return;
  const s = useRemote.getState();
  // Back from a lock: iOS dropped the socket, so reconnect at once.
  if (s.status !== "idle" && s.status !== "denied" && !ws) connect();
}

export const useRemote = create<RemoteStore>((set, get) => ({
  status: "idle",
  screens: 0,
  reconnecting: false,
  slug: null,
  gatheringId: null,
  start: (gatheringId, slug) => {
    if (get().status !== "idle" && get().status !== "denied" && get().slug === slug) {
      set({ gatheringId });
      scheduleSync();
      return;
    }
    get().stop();
    // A slide left live on this phone from another gathering (or long ago)
    // must not appear on the screen: start from nothing.
    const live = useLive.getState();
    const g = useLibrary.getState().gatherings[gatheringId];
    if (live.setId && !g?.setIds.includes(live.setId)) {
      live.setLive({ setId: null, slideId: null, slideOcc: 0, blackout: false, clear: false });
    }
    roomHas = {};
    lastMeta = lastLive = "";
    attempts = 0;
    set({
      status: "connecting",
      screens: 0,
      reconnecting: false,
      slug,
      gatheringId,
    });
    unsubs = [useLibrary.subscribe(scheduleSync), useLive.subscribe(() => syncLive())];
    document.addEventListener("visibilitychange", onVisible);
    connect();
  },
  stop: () => {
    const sock = ws;
    ws = null;
    stopTimers();
    if (reconnectingTimer) clearTimeout(reconnectingTimer);
    if (screensGoneTimer) clearTimeout(screensGoneTimer);
    reconnectingTimer = screensGoneTimer = null;
    unsubs.forEach((u) => u());
    unsubs = [];
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", onVisible);
    if (sock) {
      try {
        if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: "reset" }));
        sock.close(1000, "Disconnected");
      } catch {}
    }
    set({ status: "idle", screens: 0, reconnecting: false });
  },
}));
