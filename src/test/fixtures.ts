import type { Session } from "@supabase/supabase-js";
import type { Gathering, Set as PhytoSet } from "@/lib/types";
import type { SyncDiff } from "@/lib/sync";
import type { Row } from "./supabase-mock";

export const USER_ID = "00000000-0000-4000-8000-000000000001";

export const fakeSession = {
  user: { id: USER_ID, email: "test@example.com" },
  access_token: "test-token",
} as unknown as Session;

let seq = 0;

export function makeSet(overrides: Partial<PhytoSet> = {}): PhytoSet {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    name: `Set ${seq}`,
    kind: "song",
    slides: [{ id: `slide-${seq}`, kind: "lyric", lines: ["Amazing grace"] }],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

export function makeGathering(overrides: Partial<Gathering> = {}): Gathering {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    name: `Gathering ${seq}`,
    setIds: [],
    share_token: `token-${seq}`,
    is_live: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

/** A set as its Supabase `sets` row, matching toSupabaseSet's shape. */
export function setRow(s: PhytoSet, userId = USER_ID): Row {
  return {
    id: s.id,
    user_id: userId,
    title: s.name,
    type: s.kind,
    content: {
      slides: s.slides,
      template: s.template,
      autoAdvanceMs: s.autoAdvanceMs,
      loop: s.loop,
      dissolveMs: s.dissolveMs,
    },
    created_at: new Date(s.createdAt).toISOString(),
    updated_at: new Date(s.updatedAt).toISOString(),
  };
}

/** A gathering as its Supabase `gatherings` row (setIds live in gathering_sets). */
export function gatheringRow(p: Gathering, userId = USER_ID): Row {
  return {
    id: p.id,
    user_id: userId,
    title: p.name,
    share_token: p.share_token,
    is_live: p.is_live,
    created_at: new Date(p.createdAt).toISOString(),
    updated_at: new Date(p.updatedAt).toISOString(),
  };
}

export function gatheringSetRows(p: Gathering): Row[] {
  return p.setIds.map((setId, i) => ({
    id: `gs-${p.id}-${i}`,
    gathering_id: p.id,
    set_id: setId,
    position: i,
  }));
}

export function emptyDiff(overrides: Partial<SyncDiff> = {}): SyncDiff {
  return {
    onlyLocal: { sets: [], gatherings: [] },
    onlyRemote: { sets: [], gatherings: [] },
    modified: { sets: [], gatherings: [] },
    rekeyed: { sets: [], gatherings: [] },
    strandedLocal: { sets: [], gatherings: [] },
    touched: { sets: [], gatherings: [] },
    localEmpty: false,
    ...overrides,
  };
}
