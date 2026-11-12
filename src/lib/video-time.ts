// The live video's position, for the playbar (desktop presenter and the
// phone remote). The window or screen playing the video reports it: Stage
// Output over a BroadcastChannel, the screen link through the screen room.

import { create } from "zustand";

export interface VideoTime {
  /** The slide playing (a report for another slide is stale). */
  slideId: string | null;
  /** Seconds in, and the video's length (0 until known). */
  current: number;
  duration: number;
}

export const useVideoTime = create<VideoTime>(() => ({ slideId: null, current: 0, duration: 0 }));

export const VIDEO_TIME_CHANNEL = "stage-video-time-v1";

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(VIDEO_TIME_CHANNEL);
  return channel;
}

/** Stage Output: tell the presenter where the video is. */
export function postVideoTime(t: VideoTime): void {
  try {
    getChannel()?.postMessage(t);
  } catch {}
}

/** The presenter: follow Stage Output's reports. Returns the unsubscribe. */
export function listenVideoTime(): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const on = (e: MessageEvent) => {
    const t = e.data as VideoTime;
    if (t && typeof t.current === "number") useVideoTime.setState(t);
  };
  ch.addEventListener("message", on);
  return () => ch.removeEventListener("message", on);
}

/** Calls `send` at most every `ms` (the latest value wins), so a playing
 *  video reports a few times a second, not on every frame. */
export function throttleLatest<T>(send: (v: T) => void, ms: number): (v: T) => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  return (v: T) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      send(v);
      return;
    }
    pending = v;
    if (timer) return;
    timer = setTimeout(
      () => {
        timer = null;
        last = Date.now();
        if (pending !== null) send(pending);
        pending = null;
      },
      ms - (now - last),
    );
  };
}
