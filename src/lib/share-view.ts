/**
 * The /g/<token> share viewer's data contract.
 *
 * The viewer is unauthenticated and reads ONLY through the security-definer RPC
 * `get_share_view(p_token)` (src/lib/migrations/2026-10-09-share-view-rpc.sql).
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
}

export interface ShareSetRow {
  id: string;
  title: string;
  type: string;
  content: { slides: ShareSlide[]; chords?: SongChords; versions?: string[] };
}

export interface ShareGathering {
  title: string;
  is_live: boolean;
  /** Epoch ms, or null. Paired with `is_live` to give the 24h auto-expiry. */
  live_started_at: number | null;
  /** Section keys the leader has hidden this session, keyed by set id. */
  hidden_sections: Record<string, string[]>;
}

/** What a /g/<token> lookup resolved to:
 *  - "gathering": drives the live/ended/not-live flow. `sets` is empty unless
 *                 the server considers the gathering live right now.
 *  - "waiting":   the token is a real account/group slug, but nothing is live in
 *                 that scope → a generic waiting page.
 *  - null:        the token matches nothing. */
export type ShareResolution =
  | { kind: "gathering"; gathering: ShareGathering; sets: ShareSetRow[] }
  | { kind: "waiting" }
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
  if (raw.kind === "waiting") return { kind: "waiting" };
  if (raw.kind !== "gathering" || !isRecord(raw.gathering)) return null;

  const g = raw.gathering;
  const hidden = isRecord(g.hidden_sections) ? (g.hidden_sections as Record<string, string[]>) : {};
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
    },
    sets,
  };
}
