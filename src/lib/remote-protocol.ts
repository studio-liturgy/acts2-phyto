// Present from a phone (n133): the messages between the remote (a signed-in
// phone), the room (a Durable Object on the Worker, src/room/screen-room.ts)
// and the screens (/screen/<slug>, the TV or projector). Pure, so the room,
// both clients and the tests share one definition.
//
// The remote is the source of truth. On connect it sends the gathering once
// (meta, then each set split into parts), then only small live messages. The
// room keeps the last of each so a screen that joins or reloads mid-service
// catches up at once, even while the remote is away.

import type { Background, LiveState, Set as PhytoSet, SetTemplate } from "./types";

/** Everything about the gathering that isn't a set: what the screen draws with. */
export interface RemoteMeta {
  gatheringId: string;
  setIds: string[];
  songTemplate?: SetTemplate;
  scriptureTemplate?: SetTemplate;
  background: Background;
  fadeMs: number;
}

/** The live state a screen needs (the presenter's live snapshot). */
export type RemoteLive = Pick<
  LiveState,
  | "setId"
  | "slideId"
  | "slideOcc"
  | "blackout"
  | "clear"
  | "blackoutFadeMs"
  | "videoCmd"
  | "videoEnded"
  | "refresh"
>;

/** One piece of a set: Workers cap a socket message at 1 MiB, and a set with
 *  inline images can be several MB. `v` is the set's content hash. */
export interface SetPart {
  t: "part";
  id: string;
  v: string;
  i: number;
  n: number;
  d: string;
}

export type RemoteToRoom =
  | { t: "auth"; token: string }
  | { t: "meta"; meta: RemoteMeta }
  | SetPart
  | { t: "live"; live: RemoteLive }
  | { t: "reset" };

export type ScreenToRoom =
  | { t: "ended"; nonce: number }
  /** The live video's position, for the remote's playbar. */
  | { t: "vtime"; slideId: string | null; current: number; duration: number };

export type RoomToRemote =
  | { t: "auth"; ok: boolean }
  /** Which set versions the room already holds in full, so a reconnecting
   *  remote only sends what changed. */
  | { t: "have"; sets: Record<string, string> }
  | { t: "screens"; n: number }
  | { t: "ended"; nonce: number }
  | { t: "vtime"; slideId: string | null; current: number; duration: number };

export type RoomToScreen =
  /** First on every connect: `empty` = no remote has sent a gathering (or it
   *  disconnected), so the screen waits; otherwise the replay follows. */
  | { t: "hello"; empty: boolean }
  | { t: "meta"; meta: RemoteMeta }
  | SetPart
  | { t: "live"; seq: number; live: RemoteLive }
  | { t: "reset" };

/** Characters per part. A JS string char is at most 3 UTF-8 bytes, so this
 *  stays under the 1 MiB message cap with room for the envelope. */
export const PART_CHARS = 250_000;

/** A short content hash (FNV-1a, 32-bit, base 36). Only compares versions. */
export function contentHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/** Split a set into parts for sending. */
export function splitSet(set: PhytoSet, size = PART_CHARS): SetPart[] {
  const json = JSON.stringify(set);
  const v = contentHash(json);
  const n = Math.max(1, Math.ceil(json.length / size));
  const parts: SetPart[] = [];
  for (let i = 0; i < n; i++) {
    parts.push({ t: "part", id: set.id, v, i, n, d: json.slice(i * size, (i + 1) * size) });
  }
  return parts;
}

/**
 * Collects parts into whole sets. A part of a different version starts the
 * set over when it's the first part, and is ignored otherwise (a leftover of
 * an older version). `add` returns the set once its last part is in.
 */
export class PartsBuffer {
  private open = new Map<string, { v: string; parts: string[]; got: number }>();

  add(p: SetPart): PhytoSet | null {
    let cur = this.open.get(p.id);
    if (!cur || cur.v !== p.v) {
      // A mid-set part of a version that never started here: wait for part 0.
      if (p.i !== 0) return null;
      cur = { v: p.v, parts: new Array<string>(p.n), got: 0 };
      this.open.set(p.id, cur);
    }
    if (cur.parts[p.i] === undefined) cur.got++;
    cur.parts[p.i] = p.d;
    if (cur.got < p.n) return null;
    this.open.delete(p.id);
    try {
      return JSON.parse(cur.parts.join("")) as PhytoSet;
    } catch {
      return null;
    }
  }

  clear() {
    this.open.clear();
  }
}

/** Parse a socket message, or null for anything that isn't a JSON object
 *  with a string `t`. */
export function parseMessage<T extends { t: string }>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  try {
    const m = JSON.parse(raw) as unknown;
    if (m && typeof m === "object" && typeof (m as { t?: unknown }).t === "string") return m as T;
  } catch {}
  return null;
}

/** The room address for a share slug (same host as the page). */
export function roomPath(slug: string, role: "remote" | "screen"): string {
  return `/screen-room/${encodeURIComponent(slug)}?role=${role}`;
}

/** The screen link for a share slug, on this site (phytoexp.live on test:
 *  the screen needs the new code, unlike /g links). */
export function screenLinkUrl(origin: string, slug: string): string {
  return `${origin}/screen/${slug}`;
}

/** Wait before reconnect attempt `n` (0-based): 1, 2, 4, 8, then 10 s. */
export function reconnectDelay(n: number): number {
  return Math.min(10_000, 1000 * 2 ** Math.max(0, n));
}
