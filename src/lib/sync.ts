import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import { db } from "./db";
import type { Set as PhytoSet, Gathering } from "./types";
import { useSyncStatusStore } from "../hooks/use-sync-status";
import { nanoid } from "nanoid";

// Deterministic UUID v5-like from two strings using SubtleCrypto.
// Used to generate stable UUIDs for gathering_sets rows from (gathering_id, position).
async function deterministicUuid(a: string, b: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(`${a}:${b}`));
  const hex = Array.from(new Uint8Array(buf))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSession() {
  return useAuthStore.getState().session;
}

/** Returns a stable device ID, generated once and persisted in localStorage. */
function getDeviceId(): string {
  const key = "phyto-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function toSupabaseSet(s: PhytoSet, userId: string, deviceId: string) {
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
    synced_at: new Date().toISOString(),
    last_modified_by: deviceId,
  };
}

function toSupabaseGathering(p: Gathering, userId: string, deviceId: string) {
  // NOTE: `is_live` is intentionally omitted. It is server-authoritative and
  // managed exclusively by goLive/endSession. Including it here would let an
  // unrelated content push clobber the server's true live flag with stale
  // local data. PostgREST upsert leaves omitted columns untouched on conflict,
  // and a brand-new inserted row gets the schema default (false).
  return {
    id: p.id,
    user_id: userId,
    title: p.name,
    share_token: p.share_token,
    current_set_index: 0,
    current_slide_index: 0,
    created_at: new Date(p.createdAt).toISOString(),
    updated_at: new Date(p.updatedAt).toISOString(),
    last_modified_by: deviceId,
  };
}

function fromSupabaseSet(row: Record<string, unknown>): PhytoSet {
  const content = (row.content ?? {}) as Record<string, unknown>;
  return {
    id: row.id as string,
    name: row.title as string,
    kind: row.type as PhytoSet["kind"],
    slides: (content.slides as PhytoSet["slides"]) ?? [],
    template: content.template as PhytoSet["template"],
    autoAdvanceMs: content.autoAdvanceMs as number | undefined,
    loop: content.loop as boolean | undefined,
    dissolveMs: content.dissolveMs as number | undefined,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

function fromSupabaseGathering(row: Record<string, unknown>, setIds: string[]): Gathering {
  return {
    id: row.id as string,
    name: row.title as string,
    share_token: (row.share_token as string) || nanoid(10),
    is_live: (row.is_live as boolean) ?? false,
    setIds,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

// ---------------------------------------------------------------------------
// Cross-tab coordination
// ---------------------------------------------------------------------------
// NOTE: Cross-tab store refresh is handled reactively by the Dexie `liveQuery`
// subscription in `store.ts` — every tab re-derives its store from Dexie on any
// write (local mutation, merge, or push writeback). No bespoke `sync-complete`
// BroadcastChannel is needed; the old one was a duplication footgun because it
// only fired on push, never on merge, leaving other tabs with stale ids.

// ---------------------------------------------------------------------------
// Fetch remote sets + gatherings (shared by diff and apply functions)
// ---------------------------------------------------------------------------

async function fetchRemote(userId: string) {
  const [setsRes, gatheringsRes, gatheringSetsRes] = await Promise.all([
    supabase.from("sets").select("*").eq("user_id", userId),
    supabase.from("gatherings").select("*").eq("user_id", userId),
    supabase.from("gathering_sets").select("*"),
  ]);

  if (setsRes.error) console.error("[sync] fetchRemote: sets error", setsRes.error);
  if (gatheringsRes.error)
    console.error("[sync] fetchRemote: gatherings error", gatheringsRes.error);

  const gsRows = (gatheringSetsRes.data ?? []) as {
    gathering_id: string;
    set_id: string;
    position: number;
  }[];
  // Group by gathering, then sort by position and take the set_id in that
  // order. Sorting (rather than assigning into a sparse array by index) means
  // a genuine gap just yields a correctly-ordered shorter list instead of
  // `.filter(Boolean)` silently compacting and reshuffling later entries. A
  // duplicate position (no timestamp column exists to disambiguate) keeps
  // whichever row sorts first, deterministically.
  const rowsByGathering = new Map<string, typeof gsRows>();
  for (const row of gsRows) {
    const arr = rowsByGathering.get(row.gathering_id) ?? [];
    arr.push(row);
    rowsByGathering.set(row.gathering_id, arr);
  }
  const setIdsByGathering = new Map<string, string[]>();
  for (const [gatheringId, rows] of rowsByGathering) {
    const seenPositions = new Set<number>();
    const ids = rows
      .sort((a, b) => a.position - b.position)
      .filter((r) => {
        if (seenPositions.has(r.position)) return false;
        seenPositions.add(r.position);
        return true;
      })
      .map((r) => r.set_id);
    setIdsByGathering.set(gatheringId, ids);
  }

  const sets = (setsRes.data ?? []).map((r) => fromSupabaseSet(r as Record<string, unknown>));
  const gatherings = (gatheringsRes.data ?? []).map((r) =>
    fromSupabaseGathering(
      r as Record<string, unknown>,
      setIdsByGathering.get((r as Record<string, unknown>).id as string) ?? [],
    ),
  );

  return { sets, gatherings };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type SyncDiff = {
  onlyLocal: { sets: PhytoSet[]; gatherings: Gathering[] };
  onlyRemote: { sets: PhytoSet[]; gatherings: Gathering[] };
  modified: {
    sets: { local: PhytoSet; remote: PhytoSet }[];
    gatherings: { local: Gathering; remote: Gathering }[];
  };
  /** Same logical item present both locally and remotely under DIFFERENT ids
   *  (e.g. created independently on two devices, or re-imported). Matched by a
   *  stable content key so Merge can reconcile onto the remote id instead of
   *  duplicating. Merge = accept remote. */
  rekeyed: {
    sets: { local: PhytoSet; remote: PhytoSet }[];
    gatherings: { local: Gathering; remote: Gathering }[];
  };
  /** Local-only items that are actually a stale copy of an ALREADY-SYNCED remote
   *  item (gatherings matched by share_token, sets by content key against a twin
   *  whose id is present locally) — leftovers from the old re-ID churn. The twin
   *  is id-matched so it never appears in `onlyRemote`; pushing the stale copy
   *  would violate `gatherings_share_token_key` (or silently duplicate a set), so
   *  Merge just DELETES the local copy. Auto-applied silently (excluded from
   *  `latestRemoteTime`). */
  strandedLocal: {
    sets: { localId: string; remoteId: string }[];
    gatherings: string[];
  };
  /** Timestamp-only drift: same id, identical CONTENT, different updated_at —
   *  e.g. the server trigger bumping gatherings.updated_at when goLive/endSession
   *  flip `is_live` (which is server-authoritative state, not content). Not a
   *  real conflict, so it must never open the Review-versions dialog: healed
   *  silently by adopting the remote row (and its timestamp) into Dexie.
   *  Excluded from `latestRemoteTime`. */
  touched: {
    sets: { local: PhytoSet; remote: PhytoSet }[];
    gatherings: { local: Gathering; remote: Gathering }[];
  };
  /** True when this device had zero local sets AND zero local gatherings at
   *  diff time — a brand-new/cleared browser. Nothing local to lose, so the
   *  caller can skip the Review-versions dialog and just pull the account
   *  down, even though `latestRemoteTime` is non-null (there IS remote data,
   *  just nothing to reconcile it against). */
  localEmpty: boolean;
};

// Stable content-identity keys used to reconcile items whose ids diverged.
// `createdAt` is part of the key: a single logical item synced/exported once
// carries the same createdAt across devices, so true twins still pair — but two
// items created INDEPENDENTLY on two devices (e.g. both default-named with
// today's date) get different createdAt and stay distinct, instead of one being
// silently merged away. Sets also use kind + slide count as cheap, edit-tolerant
// discriminators. (share_token is intentionally excluded — unstable across merges.)
function setContentKey(s: PhytoSet): string {
  return `${s.kind}::${s.name.trim().toLowerCase()}::${s.slides.length}::${s.createdAt}`;
}
function gatheringContentKey(p: Gathering): string {
  return `${p.name.trim().toLowerCase()}::${p.createdAt}`;
}

// Deep content fingerprints used to tell a REAL modification apart from
// timestamp-only drift. Key-order-independent (Postgres JSONB re-sorts object
// keys, so a plain JSON.stringify of a round-tripped slide would differ) and
// undefined-key-insensitive (JSONB drops undefined keys on the way in).
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** Everything that round-trips through the Supabase `sets` row (title + content
 *  JSONB). Timestamps excluded by design. */
function setFingerprint(s: PhytoSet): string {
  return stableStringify({
    name: s.name,
    kind: s.kind,
    slides: s.slides,
    template: s.template ?? null,
    autoAdvanceMs: s.autoAdvanceMs ?? null,
    loop: s.loop ?? null,
    dissolveMs: s.dissolveMs ?? null,
  });
}

/** Synced gathering content. `is_live` is deliberately EXCLUDED — it is
 *  server-authoritative session state (goLive/endSession/refreshLiveState), not
 *  content, and including it would turn every live flip into a "real" conflict. */
function gatheringFingerprint(p: Gathering): string {
  return stableStringify({ name: p.name, share_token: p.share_token, setIds: p.setIds });
}

/**
 * Reconcile two id-disjoint lists by content key: greedy 1:1, deterministic.
 * Returns matched pairs plus the reduced leftovers that stay only-local /
 * only-remote. Inputs are pre-sorted by (createdAt, id) for stable pairing.
 */
function reconcileByContentKey<T extends { id: string; createdAt: number }>(
  local: T[],
  remote: T[],
  keyOf: (t: T) => string,
): { rekeyed: { local: T; remote: T }[]; onlyLocal: T[]; onlyRemote: T[] } {
  const order = (a: T, b: T) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  const locals = [...local].sort(order);
  const remoteByKey = new Map<string, T[]>();
  for (const r of [...remote].sort(order)) {
    const arr = remoteByKey.get(keyOf(r)) ?? [];
    arr.push(r);
    remoteByKey.set(keyOf(r), arr);
  }
  const rekeyed: { local: T; remote: T }[] = [];
  const onlyLocal: T[] = [];
  for (const l of locals) {
    const queue = remoteByKey.get(keyOf(l));
    const match = queue?.shift();
    if (match) rekeyed.push({ local: l, remote: match });
    else onlyLocal.push(l);
  }
  const onlyRemote: T[] = [];
  for (const arr of remoteByKey.values()) onlyRemote.push(...arr);
  return { rekeyed, onlyLocal, onlyRemote };
}

export function hasDifferences(diff: SyncDiff): boolean {
  return (
    diff.onlyLocal.sets.length > 0 ||
    diff.onlyLocal.gatherings.length > 0 ||
    diff.onlyRemote.sets.length > 0 ||
    diff.onlyRemote.gatherings.length > 0 ||
    diff.modified.sets.length > 0 ||
    diff.modified.gatherings.length > 0 ||
    diff.rekeyed.sets.length > 0 ||
    diff.rekeyed.gatherings.length > 0 ||
    diff.strandedLocal.sets.length > 0 ||
    diff.strandedLocal.gatherings.length > 0 ||
    diff.touched.sets.length > 0 ||
    diff.touched.gatherings.length > 0
  );
}

// NOTE: `strandedLocal` and `touched` are intentionally excluded — they are
// auto-healable non-conflicts, and a diff containing ONLY them must return null
// here so runDiff's `latestRemoteTime(diff) === null` branch merges silently
// instead of opening the Review-versions dialog.
export function latestRemoteTime(diff: SyncDiff): Date | null {
  const times = [
    ...diff.onlyRemote.sets.map((s) => s.updatedAt),
    ...diff.onlyRemote.gatherings.map((p) => p.updatedAt),
    ...diff.modified.sets.map(({ remote }) => remote.updatedAt),
    ...diff.modified.gatherings.map(({ remote }) => remote.updatedAt),
    ...diff.rekeyed.sets.map(({ remote }) => remote.updatedAt),
    ...diff.rekeyed.gatherings.map(({ remote }) => remote.updatedAt),
  ];
  return times.length ? new Date(Math.max(...times)) : null;
}

export async function diffWithSupabase(): Promise<SyncDiff | null> {
  const session = getSession();
  if (!session) return null;

  const [localSets, localGatherings] = await Promise.all([
    db.sets.toArray(),
    db.gatherings.toArray(),
  ]);

  const { sets: remoteSets, gatherings: remoteGatherings } = await fetchRemote(session.user.id);

  const localSetMap = new Map(localSets.map((s) => [s.id, s]));
  const localGatheringMap = new Map(localGatherings.map((p) => [p.id, p]));
  const remoteSetMap = new Map(remoteSets.map((s) => [s.id, s]));
  const remoteGatheringMap = new Map(remoteGatherings.map((p) => [p.id, p]));

  // 1. Id-based classification (existing behavior).
  const idOnlyLocalSets = localSets.filter((s) => !remoteSetMap.has(s.id));
  const idOnlyLocalGatherings = localGatherings.filter((p) => !remoteGatheringMap.has(p.id));
  const idOnlyRemoteSets = remoteSets.filter((s) => !localSetMap.has(s.id));
  const idOnlyRemoteGatherings = remoteGatherings.filter((p) => !localGatheringMap.has(p.id));

  // 1b. Stranded-duplicate detection: an id-only-local item that is actually a
  //     stale copy of an ALREADY-SYNCED remote item (gathering matched by unique
  //     share_token; set matched by content key against a twin whose id is also
  //     present locally). The twin is id-matched so it's never in the only-remote
  //     pool below — without this, the stale copy would be pushed forever and hit
  //     `gatherings_share_token_key` (or silently duplicate a set). Split these
  //     out; Merge deletes the local copy. (Token/content twins that are ONLY
  //     remote stay in the only-local lists and are handled by reconcileByContentKey.)
  const remoteGatheringIdByToken = new Map(remoteGatherings.map((g) => [g.share_token, g.id]));
  const syncedRemoteSetIdByKey = new Map<string, string>();
  for (const r of remoteSets) {
    if (localSetMap.has(r.id) && !syncedRemoteSetIdByKey.has(setContentKey(r))) {
      syncedRemoteSetIdByKey.set(setContentKey(r), r.id);
    }
  }

  const strandedSets: { localId: string; remoteId: string }[] = [];
  const reconcileLocalSets = idOnlyLocalSets.filter((s) => {
    const twinId = syncedRemoteSetIdByKey.get(setContentKey(s));
    if (twinId && twinId !== s.id) {
      strandedSets.push({ localId: s.id, remoteId: twinId });
      return false;
    }
    return true;
  });

  const strandedGatherings: string[] = [];
  const reconcileLocalGatherings = idOnlyLocalGatherings.filter((p) => {
    const twinId = remoteGatheringIdByToken.get(p.share_token);
    if (twinId && twinId !== p.id) {
      strandedGatherings.push(p.id);
      return false;
    }
    return true;
  });

  // 2. Content-key reconciliation: pair id-disjoint items that are the same
  //    logical content, so Merge converges on the remote id instead of dup-ing.
  const setRec = reconcileByContentKey(reconcileLocalSets, idOnlyRemoteSets, setContentKey);
  const gatheringRec = reconcileByContentKey(
    reconcileLocalGatherings,
    idOnlyRemoteGatherings,
    gatheringContentKey,
  );

  // 3. Id-matched timestamp mismatches, partitioned by deep content equality:
  //    identical content → `touched` (timestamp-only drift, e.g. the server
  //    trigger bumping updated_at when goLive/endSession flip is_live; healed
  //    silently), different content → `modified` (a real conflict, dialog-worthy).
  const tsChanged = <T extends { id: string; updatedAt: number }>(
    remote: T[],
    localMap: Map<string, T>,
  ) =>
    remote
      .filter((r) => {
        const local = localMap.get(r.id);
        return local && Math.round(local.updatedAt / 1000) !== Math.round(r.updatedAt / 1000);
      })
      .map((r) => ({ local: localMap.get(r.id)!, remote: r }));

  const modifiedSets: { local: PhytoSet; remote: PhytoSet }[] = [];
  const touchedSets: { local: PhytoSet; remote: PhytoSet }[] = [];
  for (const pair of tsChanged(remoteSets, localSetMap)) {
    (setFingerprint(pair.local) === setFingerprint(pair.remote) ? touchedSets : modifiedSets).push(
      pair,
    );
  }

  const modifiedGatherings: { local: Gathering; remote: Gathering }[] = [];
  const touchedGatherings: { local: Gathering; remote: Gathering }[] = [];
  for (const pair of tsChanged(remoteGatherings, localGatheringMap)) {
    (gatheringFingerprint(pair.local) === gatheringFingerprint(pair.remote)
      ? touchedGatherings
      : modifiedGatherings
    ).push(pair);
  }

  return {
    strandedLocal: { sets: strandedSets, gatherings: strandedGatherings },
    onlyLocal: { sets: setRec.onlyLocal, gatherings: gatheringRec.onlyLocal },
    onlyRemote: { sets: setRec.onlyRemote, gatherings: gatheringRec.onlyRemote },
    modified: { sets: modifiedSets, gatherings: modifiedGatherings },
    touched: { sets: touchedSets, gatherings: touchedGatherings },
    rekeyed: { sets: setRec.rekeyed, gatherings: gatheringRec.rekeyed },
    localEmpty: localSets.length === 0 && localGatherings.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Conflict resolution: Merge (remote wins for modified)
// ---------------------------------------------------------------------------

export async function applyMerge(
  diff: SyncDiff,
  opts: { localPolicy?: "push" | "drop" } = {},
): Promise<void> {
  const { localPolicy = "push" } = opts;
  const session = getSession();
  const userId = session?.user.id;
  const deviceId = getDeviceId();

  // Map of every OLD local set id being superseded → its surviving id, used to
  // keep gathering setIds referentially valid. Populated from REKEYED sets (they
  // adopt the remote id). Only-local sets KEEP their id (they already carry real
  // UUIDs from createSet/import/migrate-legacy), so the merge is idempotent and
  // never changes a primary key out from under another tab — the root cause of
  // the multi-tab duplication. The rare exception (an id owned by another user
  // after importing someone else's .phyto) is handled by a conflict fallback in
  // Step 4, which adds to this map.
  const setIdMap = new Map<string, string>();
  for (const { local, remote } of diff.rekeyed.sets) setIdMap.set(local.id, remote.id);
  // Stranded sets are stale copies of an already-synced set: their references
  // collapse onto the surviving twin's id (then the local copy is deleted below).
  for (const { localId, remoteId } of diff.strandedLocal.sets) setIdMap.set(localId, remoteId);
  const remapSetIds = (ids: string[]) => ids.map((sid) => setIdMap.get(sid) ?? sid);

  // Merge = "accept remote." Order matters: reconcile SETS before GATHERINGS so
  // gathering setIds can be remapped to surviving set ids, and so Supabase
  // gathering_sets never reference a set that doesn't exist yet (FK).

  // ── Step 1: remote-authoritative SETS → Dexie (only-remote + modified +
  //    touched). Touched = identical content, drifted timestamp: adopting the
  //    remote row aligns local updatedAt with the server so the drift never
  //    re-diffs. ──
  const remoteSetsToWrite = [
    ...diff.onlyRemote.sets,
    ...diff.modified.sets.map(({ remote }) => remote),
    ...diff.touched.sets.map(({ remote }) => remote),
  ];
  if (remoteSetsToWrite.length) await db.sets.bulkPut(remoteSetsToWrite);

  // ── Step 2: rekeyed SETS — drop stale local-id rows, adopt remote rows. ──
  if (diff.rekeyed.sets.length) {
    await db.sets.bulkDelete(diff.rekeyed.sets.map(({ local }) => local.id));
    await db.sets.bulkPut(diff.rekeyed.sets.map(({ remote }) => remote));
  }

  // ── Step 2b: stranded SETS — stale local copies of an already-synced set; the
  //    twin stays put, just drop the local duplicate (refs remapped via setIdMap). ──
  if (diff.strandedLocal.sets.length) {
    await db.sets.bulkDelete(diff.strandedLocal.sets.map((x) => x.localId));
  }

  // ── Step 3: remote-authoritative GATHERINGS → Dexie (only-remote + modified
  //    + rekeyed). Drop rekeyed + stranded local-id rows first. Remote copies
  //    already use remote set ids; remapSetIds is a harmless safety net. ──
  if (diff.rekeyed.gatherings.length) {
    await db.gatherings.bulkDelete(diff.rekeyed.gatherings.map(({ local }) => local.id));
  }
  // Stranded gatherings: stale copies whose share_token is already owned by a
  // synced gathering. Never pushed (would violate gatherings_share_token_key) —
  // just delete the local duplicate; the canonical copy is kept/pulled.
  if (diff.strandedLocal.gatherings.length) {
    await db.gatherings.bulkDelete(diff.strandedLocal.gatherings);
  }
  const remoteGatheringsToWrite = [
    ...diff.onlyRemote.gatherings,
    ...diff.modified.gatherings.map(({ remote }) => remote),
    ...diff.touched.gatherings.map(({ remote }) => remote),
    ...diff.rekeyed.gatherings.map(({ remote }) => remote),
  ].map((p) => ({ ...p, setIds: remapSetIds(p.setIds) }));
  if (remoteGatheringsToWrite.length) {
    try {
      await db.gatherings.bulkPut(remoteGatheringsToWrite);
    } catch {
      for (const p of remoteGatheringsToWrite) {
        try {
          await db.gatherings.put(p);
        } catch (e) {
          console.error("[applyMerge] Dexie put failed for gathering:", p.id, e);
        }
      }
    }
  }

  // ── Step 4 (Replace): drop truly only-local items instead of pushing them.
  //    "Replace" takes the account wholesale — local-only sets/gatherings are
  //    discarded, not uploaded. Kept gatherings are remote-authoritative and
  //    never reference an only-local set, so deleting them is referentially safe. ──
  if (localPolicy === "drop") {
    if (diff.onlyLocal.sets.length) {
      await db.sets.bulkDelete(diff.onlyLocal.sets.map((s) => s.id));
    }
    if (diff.onlyLocal.gatherings.length) {
      await db.gatherings.bulkDelete(diff.onlyLocal.gatherings.map((p) => p.id));
    }
  }

  // ── Step 4: push truly only-local items to Supabase, KEEPING their ids. ──
  if (localPolicy === "push" && session && userId) {
    if (diff.onlyLocal.sets.length) {
      const { error } = await supabase.from("sets").upsert(
        diff.onlyLocal.sets.map((s) => toSupabaseSet(s, userId, deviceId)),
        { onConflict: "id" },
      );
      if (error) {
        // Fallback: a set id is owned by another user (imported someone else's
        // .phyto). Re-ID just these and retry; Step 5 fixes gathering refs.
        console.error("[applyMerge] sets upsert error — re-IDing and retrying:", error);
        const reIded = diff.onlyLocal.sets.map((s) => ({
          ...s,
          id: crypto.randomUUID() as string,
        }));
        diff.onlyLocal.sets.forEach((s, i) => setIdMap.set(s.id, reIded[i].id));
        await db.sets.bulkDelete(diff.onlyLocal.sets.map((s) => s.id));
        await db.sets.bulkPut(reIded);
        const { error: retryErr } = await supabase.from("sets").upsert(
          reIded.map((s) => toSupabaseSet(s, userId, deviceId)),
          { onConflict: "id" },
        );
        if (retryErr) console.error("[applyMerge] sets re-ID retry error:", retryErr);
      }
    }

    if (diff.onlyLocal.gatherings.length) {
      // Keep id AND share_token (no remote twin exists to collide with), only
      // remap setIds through rekeyed/stranded set ids. Persist the remap locally
      // so Dexie and Supabase agree.
      const remapped = diff.onlyLocal.gatherings.map((p) => ({
        ...p,
        setIds: remapSetIds(p.setIds),
      }));
      if (setIdMap.size) await db.gatherings.bulkPut(remapped);

      // Track which gatherings actually landed so we only write join rows for them
      // (a failed parent insert would make its gathering_sets fail RLS — the 42501).
      const pushed: typeof remapped = [];
      const { error } = await supabase.from("gatherings").upsert(
        remapped.map((p) => toSupabaseGathering(p, userId, deviceId)),
        { onConflict: "id" },
      );
      if (!error) {
        pushed.push(...remapped);
      } else {
        // Race guard: a share_token collision (23505) means a synced twin already
        // owns the token — a stranded duplicate that slipped past the diff (e.g.
        // created remotely between fetch and push). Retry per-row: drop the
        // colliding local copy, keep pushing the rest.
        console.error("[applyMerge] gatherings upsert error — retrying per-row:", error);
        for (const p of remapped) {
          const { error: rowErr } = await supabase
            .from("gatherings")
            .upsert([toSupabaseGathering(p, userId, deviceId)], { onConflict: "id" });
          if (!rowErr) {
            pushed.push(p);
          } else if (rowErr.code === "23505") {
            console.warn(
              "[applyMerge] dropping stranded duplicate gathering (token collision):",
              p.id,
            );
            await db.gatherings.delete(p.id);
          } else {
            console.error("[applyMerge] gathering upsert error:", p.id, rowErr);
          }
        }
      }

      const gatheringSetRows = await Promise.all(
        pushed.flatMap((p) =>
          p.setIds.map(async (setId, i) => ({
            id: await deterministicUuid(p.id, String(i)),
            gathering_id: p.id,
            set_id: setId,
            position: i,
          })),
        ),
      );
      if (gatheringSetRows.length) {
        const { error: gsErr } = await supabase
          .from("gathering_sets")
          .upsert(gatheringSetRows, { onConflict: "id" });
        if (gsErr) console.error("[applyMerge] gathering_sets upsert error:", gsErr);
      }
    }
  }

  // ── Step 5: defensive Dexie pass — repair any remaining gathering whose
  //    setIds still reference a superseded local set id (e.g. an id-identical
  //    gathering that pointed at a rekeyed set). Dexie-only; the remote copies
  //    already reference the surviving ids. ──
  if (setIdMap.size) {
    const all = await db.gatherings.toArray();
    const fixes = all
      .filter((p) => p.setIds.some((sid) => setIdMap.has(sid)))
      .map((p) => ({ ...p, setIds: remapSetIds(p.setIds) }));
    if (fixes.length) await db.gatherings.bulkPut(fixes);
  }
}

// ---------------------------------------------------------------------------
// Push local → Supabase
// ---------------------------------------------------------------------------

/** Which rows to push. Omit for a FULL push (every row — used by the conflict
 *  dialog's Push and as a fallback). Provide ids for an INCREMENTAL push that
 *  reads and uploads only the changed rows (the debounced hot path). */
export type PushTarget = { setIds: string[]; gatheringIds: string[] };

async function doPush(userId: string, target?: PushTarget): Promise<boolean> {
  const { setStatus } = useSyncStatusStore.getState();
  const deviceId = getDeviceId();

  // Tracks whether every write in this push actually landed. Previously this
  // function unconditionally returned true and only console.error'd on
  // failure, so a partial failure (network blip, RLS hiccup, etc.) silently
  // and permanently dropped data from Supabase — store.ts's dirty-id retry
  // (which only re-queues on a `false` return) never engaged.
  let ok = true;

  setStatus("syncing");
  try {
    // Incremental: read ONLY the dirty rows (filtering out any deleted between
    // mark and push). Full: read everything. bulkGet returns undefined for
    // missing ids, so a row deleted after being marked dirty is simply skipped.
    const [sets, gatherings] = target
      ? await Promise.all([
          db.sets.bulkGet(target.setIds).then((rows) => rows.filter((r): r is PhytoSet => !!r)),
          db.gatherings
            .bulkGet(target.gatheringIds)
            .then((rows) => rows.filter((r): r is Gathering => !!r)),
        ])
      : await Promise.all([db.sets.toArray(), db.gatherings.toArray()]);

    if (sets.length) {
      const { data: savedSets, error } = await supabase
        .from("sets")
        .upsert(
          sets.map((s) => toSupabaseSet(s, userId, deviceId)),
          { onConflict: "id" },
        )
        .select();
      if (error) {
        console.error("[sync] pushToSupabase: sets upsert error", error);
        ok = false;
      }
      if (savedSets?.length) {
        for (const row of savedSets as Record<string, unknown>[]) {
          await db.sets
            .where("id")
            .equals(row.id as string)
            .modify({
              updatedAt: new Date(row.updated_at as string).getTime(),
            });
        }
      }
    }

    if (gatherings.length) {
      // Gatherings that actually landed in Supabase. A failed parent must be
      // excluded from the gathering_sets rewrite below, or its join rows fail RLS.
      let pushedGatherings = gatherings;
      const savedGatherings: Record<string, unknown>[] = [];

      const { data, error: gErr } = await supabase
        .from("gatherings")
        .upsert(
          gatherings.map((p) => toSupabaseGathering(p, userId, deviceId)),
          { onConflict: "id" },
        )
        .select();
      if (!gErr) {
        savedGatherings.push(...((data ?? []) as Record<string, unknown>[]));
      } else {
        // Race/leftover guard: a 23505 share_token collision means a synced
        // gathering already owns that token under a different id — this local copy
        // is a stranded duplicate. Retry per-row: drop the colliding local copy,
        // keep pushing the rest. Mirrors the applyMerge guard.
        console.error("[sync] pushToSupabase: gatherings upsert error — retrying per-row", gErr);
        const survivors: typeof gatherings = [];
        for (const p of gatherings) {
          const { data: rowData, error: rowErr } = await supabase
            .from("gatherings")
            .upsert([toSupabaseGathering(p, userId, deviceId)], { onConflict: "id" })
            .select();
          if (!rowErr) {
            survivors.push(p);
            if (rowData?.length) savedGatherings.push(...(rowData as Record<string, unknown>[]));
          } else if (rowErr.code === "23505") {
            console.warn(
              "[sync] pushToSupabase: dropping stranded duplicate gathering (token collision):",
              p.id,
            );
            await db.gatherings.delete(p.id);
          } else {
            console.error("[sync] pushToSupabase: gathering upsert error", p.id, rowErr);
            ok = false;
          }
        }
        pushedGatherings = survivors;
      }

      // Sync server-side timestamps back to Dexie. The server may have a trigger
      // that updates updated_at, so we need the exact value Supabase stored —
      // otherwise the next diff sees a stale local timestamp and fires a false conflict.
      // We only update the timestamp field, not setIds (gathering_sets haven't been
      // written yet so reading them back would produce the wrong order).
      for (const row of savedGatherings) {
        await db.gatherings
          .where("id")
          .equals(row.id as string)
          .modify({
            updatedAt: new Date(row.updated_at as string).getTime(),
          });
      }

      if (!pushedGatherings.length) {
        setStatus("synced");
        return ok;
      }

      const { data: existingGs } = await supabase
        .from("gathering_sets")
        .select("set_id, position, gathering_id")
        .in(
          "gathering_id",
          pushedGatherings.map((p) => p.id),
        );

      const existingByGathering = new Map<string, string[]>();
      for (const row of (existingGs ?? []) as {
        gathering_id: string;
        set_id: string;
        position: number;
      }[]) {
        const arr = existingByGathering.get(row.gathering_id) ?? [];
        arr[row.position] = row.set_id;
        existingByGathering.set(row.gathering_id, arr);
      }

      // Only rewrite gatherings whose ordered setIds actually changed — avoids
      // churning the join table (and the public viewer's poll) on every push.
      const gatheringsToSync = pushedGatherings.filter((p) => {
        const existing = existingByGathering.get(p.id) ?? [];
        return (
          existing.length !== p.setIds.length || p.setIds.some((sid, i) => existing[i] !== sid)
        );
      });

      // Atomic rewrite per gathering: the row id is deterministic from
      // (gathering_id, position), so upserting on the PK `id` overwrites each
      // position IN PLACE — no delete-then-insert window where a public viewer
      // could read an empty set list. Then trim any now-removed tail positions.
      for (const p of gatheringsToSync) {
        const rows = await Promise.all(
          p.setIds.map(async (setId, i) => ({
            id: await deterministicUuid(p.id, String(i)),
            gathering_id: p.id,
            set_id: setId,
            position: i,
          })),
        );

        if (rows.length) {
          const { error: upErr } = await supabase
            .from("gathering_sets")
            .upsert(rows, { onConflict: "id" });
          if (upErr) {
            console.error("[sync] pushToSupabase: gathering_sets upsert error", upErr);
            ok = false;
          }
        }

        const { error: trimErr } = await supabase
          .from("gathering_sets")
          .delete()
          .eq("gathering_id", p.id)
          .gte("position", p.setIds.length);
        if (trimErr) {
          console.error("[sync] pushToSupabase: gathering_sets trim error", trimErr);
          ok = false;
        }
      }
    }

    setStatus("synced");
    // No broadcast needed: the timestamp writebacks above mutate Dexie, which the
    // cross-tab `liveQuery` in store.ts picks up to refresh every tab's store.
    return ok;
  } catch (e) {
    console.error("[sync] pushToSupabase: unexpected error", e);
    setStatus("synced");
    return false;
  }
}

/**
 * Acquire the shared sync lock (cross-tab via `navigator.locks`) before running
 * `fn`. All sync mutations — pushes AND merges — must run under this single lock
 * name so they serialize and never interleave (the merge's only-local re-ID push
 * is not idempotent, so a concurrent second pass would duplicate everything).
 */
export async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("phyto-sync", fn) as Promise<T>;
  }
  return fn();
}

/**
 * Serialized "accept remote" merge. Recomputes the diff INSIDE the lock so a
 * concurrent or repeat invocation sees the already-applied state and no-ops —
 * critical because `applyMerge`'s only-local path re-IDs items (not idempotent).
 */
export async function mergeFromSupabase(): Promise<void> {
  await withSyncLock(async () => {
    const fresh = await diffWithSupabase();
    if (fresh && hasDifferences(fresh)) await applyMerge(fresh);
  });
}

/**
 * Serialized "take the account wholesale" replace. Like {@link mergeFromSupabase}
 * but local-only items are DELETED rather than pushed — the account wins
 * everywhere and nothing local is uploaded. Recomputes the diff inside the lock
 * so a concurrent/repeat invocation no-ops cleanly.
 */
export async function replaceWithSupabase(): Promise<void> {
  await withSyncLock(async () => {
    const fresh = await diffWithSupabase();
    if (fresh && hasDifferences(fresh)) await applyMerge(fresh, { localPolicy: "drop" });
  });
}

// ---------------------------------------------------------------------------
// Effects preview (shown in the confirmation dialog before applying)
// ---------------------------------------------------------------------------

export type SyncAction = "merge" | "push" | "replace";

type EffectNames = { sets: string[]; gatherings: string[] };
export type SyncEffects = {
  local: { added: EffectNames; updated: EffectNames; removed: EffectNames };
  account: { added: EffectNames; updated: EffectNames; removed: EffectNames };
};

const emptyNames = (): EffectNames => ({ sets: [], gatherings: [] });
const emptySide = () => ({ added: emptyNames(), updated: emptyNames(), removed: emptyNames() });

/**
 * Human-readable summary of what an action will do, derived from the diff. Only
 * user-meaningful buckets are surfaced (onlyLocal / onlyRemote / modified); the
 * internal reconciliation buckets (rekeyed / touched / strandedLocal) are
 * content-identical or housekeeping and intentionally omitted.
 */
export function previewEffects(diff: SyncDiff, action: SyncAction): SyncEffects {
  const effects: SyncEffects = { local: emptySide(), account: emptySide() };

  if (action === "merge") {
    // Local gains remote-only items and adopts remote versions of conflicts.
    effects.local.added.sets = diff.onlyRemote.sets.map((s) => s.name);
    effects.local.added.gatherings = diff.onlyRemote.gatherings.map((p) => p.name);
    effects.local.updated.sets = diff.modified.sets.map(({ remote }) => remote.name);
    effects.local.updated.gatherings = diff.modified.gatherings.map(({ remote }) => remote.name);
    // Account gains the local-only items (pushed up).
    effects.account.added.sets = diff.onlyLocal.sets.map((s) => s.name);
    effects.account.added.gatherings = diff.onlyLocal.gatherings.map((p) => p.name);
  } else if (action === "push") {
    // Account becomes an exact mirror of local: gains local-only items, adopts the
    // local version of conflicts, and LOSES items that exist only online.
    effects.account.added.sets = diff.onlyLocal.sets.map((s) => s.name);
    effects.account.added.gatherings = diff.onlyLocal.gatherings.map((p) => p.name);
    effects.account.updated.sets = diff.modified.sets.map(({ local }) => local.name);
    effects.account.updated.gatherings = diff.modified.gatherings.map(({ local }) => local.name);
    effects.account.removed.sets = diff.onlyRemote.sets.map((s) => s.name);
    effects.account.removed.gatherings = diff.onlyRemote.gatherings.map((p) => p.name);
    // Local is left unchanged.
  } else {
    // replace: local mirrors the account; local-only items are deleted.
    effects.local.added.sets = diff.onlyRemote.sets.map((s) => s.name);
    effects.local.added.gatherings = diff.onlyRemote.gatherings.map((p) => p.name);
    effects.local.updated.sets = diff.modified.sets.map(({ remote }) => remote.name);
    effects.local.updated.gatherings = diff.modified.gatherings.map(({ remote }) => remote.name);
    effects.local.removed.sets = diff.onlyLocal.sets.map((s) => s.name);
    effects.local.removed.gatherings = diff.onlyLocal.gatherings.map((p) => p.name);
    // Account is left unchanged.
  }

  return effects;
}

export async function pushToSupabase(target?: PushTarget): Promise<boolean> {
  const session = getSession();
  if (!session) {
    // Nothing was pushed, but it's not a failure to retry — treat as success so
    // the caller doesn't re-queue dirty ids forever while signed out.
    return true;
  }
  const userId = session.user.id;
  return withSyncLock(async () => doPush(userId, target));
}

/** Delete the account-only sets/gatherings named by the diff. `gathering_sets`
 *  rows cascade-delete with their parent (schema.sql `on delete cascade`), so
 *  only the parent rows are removed here. */
async function deleteRemoteOnly(userId: string, diff: SyncDiff): Promise<void> {
  const gatheringIds = diff.onlyRemote.gatherings.map((p) => p.id);
  const setIds = diff.onlyRemote.sets.map((s) => s.id);
  if (gatheringIds.length) {
    const { error } = await supabase
      .from("gatherings")
      .delete()
      .in("id", gatheringIds)
      .eq("user_id", userId);
    if (error) console.error("[sync] pushMirror: gatherings delete error", error);
  }
  if (setIds.length) {
    const { error } = await supabase.from("sets").delete().in("id", setIds).eq("user_id", userId);
    if (error) console.error("[sync] pushMirror: sets delete error", error);
  }
}

/**
 * "Push" from the conflict dialog: make the account an exact MIRROR of local —
 * upload every local row (overwriting conflicts with the local version) AND
 * delete the rows that exist only online. The symmetric opposite of
 * {@link replaceWithSupabase}. Acts on the previewed `diff` so the deletions
 * match what the user was shown; deletes are idempotent if the rows already
 * changed remotely. Local Dexie is left untouched.
 */
export async function pushMirrorToSupabase(diff: SyncDiff): Promise<void> {
  const session = getSession();
  if (!session) return;
  const userId = session.user.id;
  await withSyncLock(async () => {
    await doPush(userId);
    await deleteRemoteOnly(userId, diff);
  });
}
