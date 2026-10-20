/**
 * The /g/<token> share viewer's data contract.
 *
 * The viewer is unauthenticated and reads ONLY through the security-definer RPC
 * `get_share_view_v2(p_token, p_version)`
 * (src/lib/migrations/2026-10-18-share-view-versioned.sql). Every answer
 * carries a `version`; sending it back gets {"kind":"unchanged"} instead of
 * the full payload when nothing has changed, which keeps polling cheap.
 * Taking the token as an argument is what makes it a key: a direct table read
 * filtered by token is applied after RLS, so it needed public policies that let
 * anyone list every gathering and live set. Never reintroduce direct anon reads
 * of gatherings, gathering_sets or sets here.
 */

import type { SongChords } from "@/lib/chords";

export interface ShareSlide {
  id?: string;
  kind: string;
  linesByVersion?: Record<string, string>;
  referencesByVersion?: Record<string, string>;
  importIndex?: number;
  title?: string;
  lines?: string[];
  section?: string;
  reference?: string;
  imageUrl?: string;
  videoSource?: "youtube" | "file" | "url";
  videoUrl?: string;
  youtubeId?: string;
  /** Multilanguage songs (see Slide). */
  linesByLang?: Record<string, string>;
  lineLangs?: string[];
  roles?: ("leader" | "people" | null)[];
  roleMarks?: boolean;
  roleAlign?: "left" | "split";
}

export interface ShareSetRow {
  id: string;
  title: string;
  type: string;
  content: {
    slides: ShareSlide[];
    chords?: SongChords;
    versions?: string[];
    /** Multilanguage songs: layout, columns and the leader's shown languages. */
    songLayout?: string;
    langs?: string[];
    langsShown?: string[];
  };
}

export interface ShareGathering {
  title: string;
  is_live: boolean;
  /** Epoch ms, or null. Paired with `is_live` to give the auto-expiry
   *  (LIVE_SESSION_MS in lib/live-session.ts). */
  live_started_at: number | null;
  /** Section keys the leader has hidden this session, keyed by set id. */
  hidden_sections: Record<string, string[]>;
  /** Song arrangements (set id → ordered section keys). Empty unless the
   *  gathering's workspace has Arrangements on. */
  arrangements: Record<string, string[]>;
}

/** What a /g/<token> lookup resolved to:
 *  - "gathering": drives the live/ended/not-live flow. `sets` is empty unless
 *                 the server considers the gathering live right now.
 *  - "waiting":   the token is a real account/group slug, but nothing is live in
 *                 that scope → a generic waiting page.
 *  - "unchanged":   same as the version the viewer sent; keep what it has.
 *  - null:        the token matches nothing. */
export type ShareResolution =
  | { kind: "gathering"; gathering: ShareGathering; sets: ShareSetRow[] }
  | { kind: "waiting" }
  | { kind: "unchanged" }
  | null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toEpochMs(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const ms = new Date(v).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function toSet(v: unknown): ShareSetRow | null {
  if (!isRecord(v) || typeof v.id !== "string") return null;
  const content = isRecord(v.content) ? v.content : {};
  return {
    id: v.id,
    title: typeof v.title === "string" ? v.title : "",
    type: typeof v.type === "string" ? v.type : "",
    content: {
      ...(content as Omit<ShareSetRow["content"], "slides">),
      slides: Array.isArray(content.slides) ? (content.slides as ShareSlide[]) : [],
    },
  };
}

/** Parse the RPC's jsonb payload. Anything malformed resolves to null
 *  ("not found") rather than throwing inside the poll loop. The server already
 *  orders sets by slot position. */
export function parseShareView(raw: unknown): ShareResolution {
  if (!isRecord(raw)) return null;
  if (raw.kind === "unchanged") return { kind: "unchanged" };
  if (raw.kind === "waiting") return { kind: "waiting" };
  if (raw.kind !== "gathering" || !isRecord(raw.gathering)) return null;

  const g = raw.gathering;
  const hidden = isRecord(g.hidden_sections) ? (g.hidden_sections as Record<string, string[]>) : {};
  const arrangements = isRecord(g.arrangements) ? (g.arrangements as Record<string, string[]>) : {};
  const sets = Array.isArray(raw.sets)
    ? raw.sets.map(toSet).filter((s): s is ShareSetRow => s !== null)
    : [];

  return {
    kind: "gathering",
    gathering: {
      title: typeof g.title === "string" ? g.title : "",
      is_live: g.is_live === true,
      live_started_at: toEpochMs(g.live_started_at),
      hidden_sections: hidden,
      arrangements,
    },
    sets,
  };
}

/** The payload version the server stamped on this answer, to send back on the
 *  next poll. null when absent (the viewer then just fetches in full). */
export function shareViewVersion(raw: unknown): string | null {
  return isRecord(raw) && typeof raw.version === "string" ? raw.version : null;
}
