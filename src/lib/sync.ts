import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import { db } from "./db";
import type { Set as PhytoSet, Gathering } from "./types";
import { useSyncStatusStore } from "../hooks/use-sync-status";
import { nanoid } from "nanoid";

// Deterministic UUID v5-like from two strings using SubtleCrypto.
// Used to generate stable UUIDs for gathering_sets rows from (gathering_id, position).
export async function deterministicUuid(a: string, b: string): Promise<string> {
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

export function toSupabaseSet(s: PhytoSet, userId: string, deviceId: string) {
  return {
    id: s.id,
    user_id: userId,
    title: s.name,
    type: s.kind,
    content: {
      slides: s.slides,
      template: s.template,
      chords: s.chords,
      autoAdvanceMs: s.autoAdvanceMs,
      loop: s.loop,
      dissolveMs: s.dissolveMs,
    },
    group_id: s.group_id ?? null,
    created_at: new Date(s.createdAt).toISOString(),
    updated_at: new Date(s.updatedAt).toISOString(),
    synced_at: new Date().toISOString(),
    last_modified_by: deviceId,
  };
}

/** Upsert payload for a FOREIGN set (one shared with me) that I edit as a
 *  collaborator. Deliberately omits user_id AND group_id, so a conflict-update
 *  leaves the owner's contributor and workspace untouched (PostgREST leaves
 *  omitted columns unchanged on conflict); RLS lets me through via the set_share
 *  grant. Only the editable title + content move. */
export function toSupabaseSetShared(s: PhytoSet, deviceId: string) {
  return {
    id: s.id,
    title: s.name,
    type: s.kind,
    content: {
      slides: s.slides,
      template: s.template,
      chords: s.chords,
      autoAdvanceMs: s.autoAdvanceMs,
      loop: s.loop,
      dissolveMs: s.dissolveMs,
    },
    updated_at: new Date(s.updatedAt).toISOString(),
    synced_at: new Date().toISOString(),
    last_modified_by: deviceId,
  };
}

export function toSupabaseGathering(p: Gathering, userId: string, deviceId: string) {
  // NOTE: `is_live` and `live_started_at` are intentionally omitted. They are
  // server-authoritative and managed exclusively by goLive/endSession (and the
  // gatherings_live_clock trigger). Including them here would let an unrelated
  // content push clobber the server's true live flag with stale local data, or
  // silently extend a running session's 24h window. PostgREST upsert leaves
  // omitted columns untouched on conflict, and a brand-new inserted row gets
  // the schema default (false / null).
  return {
    id: p.id,
    user_id: userId,
    title: p.name,
    share_token: p.share_token,
    group_id: p.group_id ?? null,
    current_set_index: 0,
    current_slide_index: 0,
    created_at: new Date(p.createdAt).toISOString(),
    updated_at: new Date(p.updatedAt).toISOString(),
    last_modified_by: deviceId,
  };
}

/** Upsert payload for a FOREIGN group gathering I edit as a collaborator.
 *  Deliberately omits user_id (so the contributor's ownership survives a
 *  conflict-update) AND is_live/live_started_at (server-authoritative). RLS
 *  admits me via group membership. group_id is kept so it stays in the group. */
export function toSupabaseGatheringShared(p: Gathering, deviceId: string) {
  return {
    id: p.id,
    title: p.name,
    share_token: p.share_token,
    group_id: p.group_id ?? null,
    created_at: new Date(p.createdAt).toISOString(),
    updated_at: new Date(p.updatedAt).toISOString(),
    last_modified_by: deviceId,
  };
}

export function fromSupabaseSet(row: Record<string, unknown>): PhytoSet {
  const content = (row.content ?? {}) as Record<string, unknown>;
  return {
    id: row.id as string,
    name: row.title as string,
    kind: row.type as PhytoSet["kind"],
    slides: (content.slides as PhytoSet["slides"]) ?? [],
    template: content.template as PhytoSet["template"],
    chords: content.chords as PhytoSet["chords"],
    autoAdvanceMs: content.autoAdvanceMs as number | undefined,
    loop: content.loop as boolean | undefined,
    dissolveMs: content.dissolveMs as number | undefined,
    group_id: row.group_id ? (row.group_id as string) : undefined,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

export function fromSupabaseGathering(row: Record<string, unknown>, setIds: string[]): Gathering {
  return {
    id: row.id as string,
    name: row.title as string,
    share_token: (row.share_token as string) || nanoid(10),
    is_live: (row.is_live as boolean) ?? false,
    live_started_at: row.live_started_at ? new Date(row.live_started_at as string).getTime() : null,
    group_id: row.group_id ? (row.group_id as string) : undefined,
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

/** Page size for paginated list queries. Also dodges PostgREST's silent
 *  max-rows cap (default 1000) on un-ranged selects. */
const LIST_PAGE_SIZE = 500;

/** How many full `sets` rows to move per request. New slide images go to R2 and
 *  `content` JSONB carries only their URL, but sets created before that change
 *  can still hold INLINE base64 images until `migrateSetImagesToR2` hoists them,
 *  so a single set can still weigh megabytes — a whole-library `select("*")` or
 *  batched upsert can exceed statement timeouts / request limits and fail
 *  wholesale. Small batches keep every request bounded by a handful of sets. */
const SET_BATCH_SIZE = 5;

/** How many content batches to keep in flight at once. A first login on a
 *  fresh device downloads EVERY set, so wall time is dominated by serial
 *  round-trips; each request stays SET_BATCH_SIZE-bounded, so limited
 *  parallelism cuts the wait without recreating the one-giant-response
 *  failure the batching exists to avoid. */
const CONTENT_FETCH_CONCURRENCY = 4;

/** Fetch every row of a query in LIST_PAGE_SIZE pages. Returns null on any
 *  page error (callers must abort rather than treat a failure as "no rows"). */
export async function fetchAllPages<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  label: string,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += LIST_PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + LIST_PAGE_SIZE - 1);
    if (error) {
      console.error(`[sync] fetchRemote: ${label} page error, aborting sync pass`, error);
      return null;
    }
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < LIST_PAGE_SIZE) return rows;
  }
}

/** A deletion tombstone row. `id` IS the deleted item's own uuid (the PK of
 *  the `deletions` table), so one tombstone exists per item and a re-delete
 *  after a resurrection refreshes `deleted_at` via upsert. */
export type Tombstone = {
  id: string;
  kind: "set" | "gathering";
  deleted_at: string;
};

/** Fetch this account's deletion tombstones. A missing `deletions` table
 *  (schema upgrade not yet run) degrades to "no tombstones" — sync keeps its
 *  old resurrect-prone behavior instead of bricking every pass. Any OTHER
 *  error aborts the pass (null): treating a failed tombstone read as "nothing
 *  was deleted" would push remotely-deleted items straight back. */
async function fetchDeletions(userId: string): Promise<Tombstone[] | null> {
  const rows: Tombstone[] = [];
  for (let from = 0; ; from += LIST_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("deletions")
      .select("id, kind, deleted_at")
      .eq("user_id", userId)
      .order("id")
      .range(from, from + LIST_PAGE_SIZE - 1);
    if (error) {
      // 42P01 = Postgres undefined_table; PGRST205 = PostgREST "table not in
      // schema cache". Both mean the upgrade SQL hasn't been run yet.
      const code = (error as { code?: string }).code;
      if (code === "42P01" || code === "PGRST205") {
        console.warn(
          "[sync] fetchRemote: deletions table missing — run the schema upgrade (deletions cannot propagate until then)",
        );
        return [];
      }
      console.error("[sync] fetchRemote: deletions page error, aborting sync pass", error);
      return null;
    }
    rows.push(...((data ?? []) as Tombstone[]));
    if ((data?.length ?? 0) < LIST_PAGE_SIZE) return rows;
  }
}

export async function fetchRemote(
  userId: string,
): Promise<{ sets: PhytoSet[]; gatherings: Gathering[]; deletions: Tombstone[] } | null> {
  // ── Sets are fetched METADATA-FIRST: the tiny columns for every row, then
  // `content` only for rows that are new or changed versus Dexie, in small
  // batches. The old whole-library `select("*")` deterministically failed on
  // image-heavy accounts precisely on the device that had no data yet — the
  // fresh-device login — because every set's inline images shipped in one
  // giant response. ──
  const [setMetaRows, gatheringRows, gsRowsAll, deletionRows] = await Promise.all([
    fetchAllPages<Record<string, unknown>>(
      (from, to) =>
        supabase
          .from("sets")
          .select("id, title, type, group_id, created_at, updated_at")
          .eq("user_id", userId)
          .order("id")
          .range(from, to),
      "sets metadata",
    ),
    fetchAllPages<Record<string, unknown>>(
      (from, to) =>
        supabase.from("gatherings").select("*").eq("user_id", userId).order("id").range(from, to),
      "gatherings",
    ),
    fetchAllPages<Record<string, unknown>>(
      (from, to) => supabase.from("gathering_sets").select("*").order("id").range(from, to),
      "gathering_sets",
    ),
    fetchDeletions(userId),
  ]);

  // A failed fetch must NOT be treated as "this account has zero rows" — that
  // silent `?? []` fallback previously let a sets-query failure sail through
  // while gatherings + gathering_sets still succeeded, so every gathering
  // landed locally with its full slot count but zero Set records to back them
  // (rendered as "(missing)" for every slot) — worse, on Replace it would
  // have deleted local-only sets outright, since they'd look like they don't
  // belong to the account. Abort the whole sync pass instead so a partial
  // fetch never gets written to Dexie as if it were the truth.
  if (!setMetaRows || !gatheringRows || !gsRowsAll || !deletionRows) return null;

  // Decide which sets actually need their content downloaded: new ids, or
  // ids whose remote updated_at differs from Dexie's (same second-rounding
  // the diff's tsChanged uses — it already treats ts-equal rows as
  // content-equal, so reusing the local row is behavior-preserving and stops
  // every login from re-downloading the entire library).
  const localSets = await db.sets.toArray();
  const localById = new Map(localSets.map((s) => [s.id, s]));
  const sameSecond = (aMs: number, bMs: number) =>
    Math.round(aMs / 1000) === Math.round(bMs / 1000);

  const sets: PhytoSet[] = [];
  const needContent: string[] = [];
  for (const row of setMetaRows) {
    const local = localById.get(row.id as string);
    const remoteUpdatedAt = new Date(row.updated_at as string).getTime();
    if (local && sameSecond(local.updatedAt, remoteUpdatedAt)) {
      // Reuse local content; adopt remote timestamps so downstream checks see
      // exactly what the server reported. group_id is adopted too: moving a set
      // between personal and a group doesn't bump updated_at, so it must be
      // picked up here rather than only on a content re-fetch.
      sets.push({
        ...local,
        group_id: row.group_id ? (row.group_id as string) : undefined,
        createdAt: new Date(row.created_at as string).getTime(),
        updatedAt: remoteUpdatedAt,
      });
    } else {
      needContent.push(row.id as string);
    }
  }

  const batches: string[][] = [];
  for (let i = 0; i < needContent.length; i += SET_BATCH_SIZE) {
    batches.push(needContent.slice(i, i + SET_BATCH_SIZE));
  }

  // Report download progress into the account-pull indicator, but only when a
  // pull is active (runDiff owns its lifecycle) — see useSyncStatusStore.pull.
  let downloadedCount = 0;
  const reportPull = () => {
    const { pull, setPull } = useSyncStatusStore.getState();
    if (pull) setPull({ done: downloadedCount, total: needContent.length });
  };
  reportPull();

  const fetchContentBatch = async (chunk: string[]): Promise<Record<string, unknown>[] | null> => {
    const { data, error } = await supabase.from("sets").select("*").in("id", chunk);
    if (!error) return (data ?? []) as Record<string, unknown>[];
    // A batch of several image-heavy sets can still be too big — retry
    // per-set so only a genuinely oversized single row can fail.
    console.warn("[sync] fetchRemote: set content batch failed, retrying per-set", error);
    const rows: Record<string, unknown>[] = [];
    for (const id of chunk) {
      const { data: one, error: oneErr } = await supabase.from("sets").select("*").eq("id", id);
      if (oneErr) {
        console.error(
          "[sync] fetchRemote: set content fetch failed, aborting sync pass",
          id,
          oneErr,
        );
        return null;
      }
      rows.push(...((one ?? []) as Record<string, unknown>[]));
    }
    return rows;
  };

  // Small worker pool over the batches. Results land indexed by batch so the
  // assembled order stays deterministic regardless of completion order.
  const batchRows: (Record<string, unknown>[] | null)[] = new Array(batches.length);
  let nextBatch = 0;
  const worker = async () => {
    for (let i = nextBatch++; i < batches.length; i = nextBatch++) {
      batchRows[i] = await fetchContentBatch(batches[i]);
      downloadedCount += batches[i].length;
      reportPull();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONTENT_FETCH_CONCURRENCY, batches.length) }, worker),
  );
  if (batchRows.some((rows) => rows === null)) return null;
  for (const rows of batchRows) {
    // A row deleted remotely between the metadata pass and this batch simply
    // comes back missing — same outcome as if the metadata pass ran later.
    for (const r of rows!) sets.push(fromSupabaseSet(r));
  }

  const gsRows = gsRowsAll as unknown as {
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

  // ── Referential-integrity guard on the fetched snapshot. The remote FK
  // (gathering_sets.set_id → sets.id, on delete cascade) guarantees every
  // join row's set exists server-side RIGHT NOW — so if a join row for one of
  // OUR gatherings references a set id absent from the sets snapshot, this
  // FETCH is lying, not the database. The known way that happens with no
  // error at all: the sets query ran without a valid user JWT — `sets` RLS is
  // owner-only and silently returns ZERO rows to anon, while `gatherings` has
  // a public share_token policy and still returns everything. Writing
  // gatherings whose slots can't resolve (and, on Replace, deleting
  // "local-only" sets) would corrupt the device, so abort the pass.
  // (Scoped to our own gatherings: the public-when-live policy also leaks
  // OTHER users' live join rows into this query, and those legitimately
  // reference sets we can never see.) ──
  // FOREIGN sets (shared with me, or a group's, contributed by other members)
  // are synced via the collaborative path and are legitimately absent from this
  // owner-only fetch — a gathering that references one is fine, so exclude them
  // from the check. A missing reference to one of MY OWN sets still fires (they
  // are never `shared`), preserving the anon-read guard. GROUP gatherings are
  // excluded outright: they reference group sets owned by other members that are
  // never in this owner-only sets fetch, so they can't be part of the check.
  const ownGatheringIds = new Set(
    gatheringRows.filter((r) => !r.group_id).map((r) => r.id as string),
  );
  const fetchedSetIds = new Set(setMetaRows.map((r) => r.id as string));
  const foreignLocalIds = new Set(localSets.filter((s) => s.shared).map((s) => s.id));
  const unresolved = [
    ...new Set(
      gsRows
        .filter(
          (r) =>
            ownGatheringIds.has(r.gathering_id) &&
            !fetchedSetIds.has(r.set_id) &&
            !foreignLocalIds.has(r.set_id),
        )
        .map((r) => r.set_id),
    ),
  ];
  if (unresolved.length) {
    console.error(
      "[sync] fetchRemote: gathering_sets reference set ids missing from the sets fetch — " +
        "aborting sync pass (likely an unauthenticated/partial sets read)",
      unresolved,
    );
    return null;
  }

  const gatherings = gatheringRows.map((r) =>
    fromSupabaseGathering(r, setIdsByGathering.get(r.id as string) ?? []),
  );

  return { sets, gatherings, deletions: deletionRows };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type SyncDiff = {
  onlyLocal: { sets: PhytoSet[]; gatherings: Gathering[] };
  onlyRemote: { sets: PhytoSet[]; gatherings: Gathering[] };
  /** Local items whose id carries a deletion tombstone at-or-after the local
   *  copy's last edit: deleted on another device while this one still held a
   *  copy. Without this bucket they'd classify as onlyLocal and Merge would
   *  push them straight back to the account — the resurrection bug. Merge
   *  DELETES the local copy. A local edit NEWER than the tombstone wins
   *  instead (stays onlyLocal, re-pushed); the then-stale tombstone is inert
   *  because tombstones are only consulted for ids absent from the remote
   *  snapshot. Excluded from `latestRemoteTime` so a deletion-only diff
   *  applies silently, matching how the deletion looked on the device that
   *  performed it. */
  remotelyDeleted: { sets: PhytoSet[]; gatherings: Gathering[] };
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
export function setContentKey(s: PhytoSet): string {
  return `${s.kind}::${s.name.trim().toLowerCase()}::${s.slides.length}::${s.createdAt}`;
}
export function gatheringContentKey(p: Gathering): string {
  return `${p.name.trim().toLowerCase()}::${p.createdAt}`;
}

// Deep content fingerprints used to tell a REAL modification apart from
// timestamp-only drift. Key-order-independent (Postgres JSONB re-sorts object
// keys, so a plain JSON.stringify of a round-tripped slide would differ) and
// undefined-key-insensitive (JSONB drops undefined keys on the way in).
export function stableStringify(v: unknown): string {
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
export function setFingerprint(s: PhytoSet): string {
  return stableStringify({
    name: s.name,
    kind: s.kind,
    slides: s.slides,
    template: s.template ?? null,
    chords: s.chords ?? null,
    autoAdvanceMs: s.autoAdvanceMs ?? null,
    loop: s.loop ?? null,
    dissolveMs: s.dissolveMs ?? null,
  });
}

/** Synced gathering content. `is_live` is deliberately EXCLUDED — it is
 *  server-authoritative session state (goLive/endSession/refreshLiveState), not
 *  content, and including it would turn every live flip into a "real" conflict. */
export function gatheringFingerprint(p: Gathering): string {
  return stableStringify({ name: p.name, share_token: p.share_token, setIds: p.setIds });
}

/**
 * Reconcile two id-disjoint lists by content key: greedy 1:1, deterministic.
 * Returns matched pairs plus the reduced leftovers that stay only-local /
 * only-remote. Inputs are pre-sorted by (createdAt, id) for stable pairing.
 */
export function reconcileByContentKey<T extends { id: string; createdAt: number }>(
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
    diff.touched.gatherings.length > 0 ||
    diff.remotelyDeleted.sets.length > 0 ||
    diff.remotelyDeleted.gatherings.length > 0
  );
}

// NOTE: `strandedLocal`, `touched`, and `remotelyDeleted` are intentionally
// excluded — they are auto-applicable non-conflicts, and a diff containing ONLY
// them must return null here so runDiff's `latestRemoteTime(diff) === null`
// branch merges silently instead of opening the Review-versions dialog. (A
// remote deletion already happened on the account; propagating it locally is
// not a version choice for the user to arbitrate.)
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

  // The zustand session is only a mirror — make sure the supabase client
  // itself holds a session (refreshing if expired), or the queries below go
  // out as anon and RLS silently returns zero sets (no error) while the
  // public gatherings policy still returns rows: the exact recipe for
  // treating a populated account as empty.
  const { data: clientAuth } = await supabase.auth.getSession();
  if (!clientAuth.session) {
    console.error("[sync] diffWithSupabase: supabase client has no session — skipping sync pass");
    return null;
  }

  const [allLocalSets, allLocalGatherings] = await Promise.all([
    db.sets.toArray(),
    db.gatherings.toArray(),
  ]);
  // Foreign (shared-with-me) sets sync through the collaborative path
  // (syncSharedSets), never the personal diff — otherwise they'd classify as
  // only-local and Merge would push them back to the account as mine.
  const localSets = allLocalSets.filter((s) => !s.shared);
  // ALL group gatherings — foreign AND my own — sync through syncGroups with
  // last-write-wins, NOT the personal diff. Keeping them out means editing a
  // group gathering never raises the "review versions" (Merge/Replace) dialog;
  // that prompt is for personal content only. My own group gatherings are still
  // pushed by the owner path in doPush.
  const localGatherings = allLocalGatherings.filter((p) => !p.shared && !p.group_id);

  const remote = await fetchRemote(session.user.id);
  if (!remote) return null;
  const { sets: remoteSets, deletions: remoteDeletions } = remote;
  // Drop group gatherings from the remote side too, so they aren't seen as
  // only-remote and pulled/overwritten by the personal merge.
  const remoteGatherings = remote.gatherings.filter((p) => !p.group_id);

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

  // 1c. Tombstone check: an id-only-local item whose id carries a deletion
  //     tombstone at-or-after the local copy's last edit was deleted on another
  //     device — classify it REMOTELY DELETED so Merge removes the local copy
  //     instead of pushing it back to the account. A local edit strictly newer
  //     than the tombstone wins (edit-over-delete): the item stays only-local
  //     and is re-pushed; once the row exists remotely again the tombstone is
  //     inert, since only ids ABSENT from the remote snapshot reach this check.
  //     (For synced-then-untouched copies, updatedAt is the server timestamp
  //     copied back at push time, so the comparison isn't skewed by this
  //     device's clock; deleted_at is the deleting device's clock, same as
  //     every other timestamp this app writes.)
  const setTombstones = new Map<string, number>();
  const gatheringTombstones = new Map<string, number>();
  for (const t of remoteDeletions) {
    (t.kind === "set" ? setTombstones : gatheringTombstones).set(
      t.id,
      new Date(t.deleted_at).getTime(),
    );
  }

  const remotelyDeletedSets: PhytoSet[] = [];
  const liveLocalSets = reconcileLocalSets.filter((s) => {
    const deletedAt = setTombstones.get(s.id);
    if (deletedAt !== undefined && deletedAt >= s.updatedAt) {
      remotelyDeletedSets.push(s);
      return false;
    }
    return true;
  });

  const remotelyDeletedGatherings: Gathering[] = [];
  const liveLocalGatherings = reconcileLocalGatherings.filter((p) => {
    const deletedAt = gatheringTombstones.get(p.id);
    if (deletedAt !== undefined && deletedAt >= p.updatedAt) {
      remotelyDeletedGatherings.push(p);
      return false;
    }
    return true;
  });

  // 2. Content-key reconciliation: pair id-disjoint items that are the same
  //    logical content, so Merge converges on the remote id instead of dup-ing.
  const setRec = reconcileByContentKey(liveLocalSets, idOnlyRemoteSets, setContentKey);
  const gatheringRec = reconcileByContentKey(
    liveLocalGatherings,
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
    remotelyDeleted: { sets: remotelyDeletedSets, gatherings: remotelyDeletedGatherings },
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

/** Rewrite one gathering's remote gathering_sets rows to match its local
 *  setIds. Row ids are deterministic from (gathering_id, position), so the
 *  upsert overwrites each position IN PLACE — no delete-then-insert window
 *  where a public viewer could read an empty set list — then any now-removed
 *  tail positions are trimmed. Idempotent; safe to repeat. Returns false if
 *  either write failed. */
export async function writeGatheringSetRows(p: Gathering): Promise<boolean> {
  let ok = true;
  const rows = await Promise.all(
    p.setIds.map(async (setId, i) => ({
      id: await deterministicUuid(p.id, String(i)),
      gathering_id: p.id,
      set_id: setId,
      position: i,
    })),
  );
  if (rows.length) {
    const { error: upErr } = await supabase.from("gathering_sets").upsert(rows, {
      onConflict: "id",
    });
    if (upErr) {
      console.error("[sync] gathering_sets upsert error", p.id, upErr);
      ok = false;
    }
  }
  const { error: trimErr } = await supabase
    .from("gathering_sets")
    .delete()
    .eq("gathering_id", p.id)
    .gte("position", p.setIds.length);
  if (trimErr) {
    console.error("[sync] gathering_sets trim error", p.id, trimErr);
    ok = false;
  }
  return ok;
}

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
  // Remotely-deleted set ids are stripped (not remapped) so no gathering pushed
  // below can reference a set that no longer exists remotely (FK failure).
  const deletedSetIds = new Set(diff.remotelyDeleted.sets.map((s) => s.id));
  const remapSetIds = (ids: string[]) =>
    ids.filter((sid) => !deletedSetIds.has(sid)).map((sid) => setIdMap.get(sid) ?? sid);

  // Merge = "accept remote." Order matters: reconcile SETS before GATHERINGS so
  // gathering setIds can be remapped to surviving set ids, and so Supabase
  // gathering_sets never reference a set that doesn't exist yet (FK).

  // ── Step 0: propagate remote deletions — drop the local copies of items
  //    tombstoned on another device. This applies under EVERY localPolicy: the
  //    deletion already happened on the account, so keeping (or re-pushing)
  //    the copy would undo it. ──
  if (diff.remotelyDeleted.sets.length) {
    await db.sets.bulkDelete([...deletedSetIds]);
  }
  if (diff.remotelyDeleted.gatherings.length) {
    await db.gatherings.bulkDelete(diff.remotelyDeleted.gatherings.map((p) => p.id));
  }

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
  // Ids of only-local sets that actually LANDED remotely (post re-ID), so
  // Step 6 can heal join rows that previously FK-failed against them.
  const pushedSetIds: string[] = [];
  if (localPolicy === "push" && session && userId) {
    if (diff.onlyLocal.sets.length) {
      const { error } = await supabase.from("sets").upsert(
        diff.onlyLocal.sets.map((s) => toSupabaseSet(s, userId, deviceId)),
        { onConflict: "id" },
      );
      if (!error) {
        pushedSetIds.push(...diff.onlyLocal.sets.map((s) => s.id));
      } else {
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
        else pushedSetIds.push(...reIded.map((s) => s.id));
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
          } else if (rowErr.code === "42501") {
            // The id exists remotely under ANOTHER account (imported .phyto
            // containing someone else's gatherings, or a different account
            // once used this browser): the upsert's conflict-update path hits
            // their row and RLS rejects it — forever, on every retry. Re-ID
            // the local copy (fresh share_token too; the old one may collide
            // with the owner's row) and push it as this account's own row.
            console.warn("[applyMerge] re-IDing gathering owned by another account:", p.id);
            const reIded = { ...p, id: crypto.randomUUID() as string, share_token: nanoid(10) };
            await db.gatherings.delete(p.id);
            await db.gatherings.put(reIded);
            const { error: reErr } = await supabase
              .from("gatherings")
              .upsert([toSupabaseGathering(reIded, userId, deviceId)], { onConflict: "id" });
            if (!reErr) pushed.push(reIded);
            else console.error("[applyMerge] re-IDed gathering upsert error:", reIded.id, reErr);
          } else {
            console.error("[applyMerge] gathering upsert error:", p.id, rowErr);
          }
        }
      }

      for (const p of pushed) await writeGatheringSetRows(p);
    }
  }

  // ── Step 5: defensive Dexie pass — repair any remaining gathering whose
  //    setIds still reference a superseded local set id (e.g. an id-identical
  //    gathering that pointed at a rekeyed set) or a remotely-deleted one.
  //    Dexie-only; the remote copies already reference the surviving ids. ──
  if (setIdMap.size || deletedSetIds.size) {
    const all = await db.gatherings.toArray();
    const fixes = all
      .filter((p) => p.setIds.some((sid) => setIdMap.has(sid) || deletedSetIds.has(sid)))
      .map((p) => ({ ...p, setIds: remapSetIds(p.setIds) }));
    if (fixes.length) await db.gatherings.bulkPut(fixes);
  }

  // ── Step 6: heal remote join rows for sets that only just became remote.
  //    A historical push could land a gathering while its sets upsert failed
  //    silently (the old swallowed-batch bug): the gathering_sets rows were
  //    rejected by the FK and never retried, leaving the remote gathering
  //    permanently EMPTY. Such a gathering is id-matched with equal
  //    timestamps, so no diff bucket ever revisits it — without this pass the
  //    sets pushed above would stay unlinked remotely forever, and every
  //    other device would keep pulling gatherings with missing sets. Rewrite
  //    join rows for every local gathering that references a just-pushed set
  //    (in-place deterministic upsert; idempotent). ──
  if (localPolicy === "push" && session && userId && pushedSetIds.length) {
    const justPushed = new Set(pushedSetIds);
    const onlyLocalIds = new Set(diff.onlyLocal.gatherings.map((p) => p.id));
    const all = await db.gatherings.toArray();
    for (const p of all) {
      // onlyLocal gatherings already had their rows written in Step 4.
      if (onlyLocalIds.has(p.id)) continue;
      if (p.setIds.some((sid) => justPushed.has(sid))) {
        await writeGatheringSetRows(p);
      }
    }
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

    // Foreign (shared-with-me) sets take the collaborative push (no user_id/
    // group_id rewrite); my own sets take the owner push. Split so each row is
    // stamped correctly.
    const ownedSets = sets.filter((s) => !s.shared);
    const sharedSets = sets.filter((s) => s.shared);

    if (ownedSets.length) {
      // Upsert in small batches: `content` can carry multi-MB inline images,
      // so a whole-library push (conflict-dialog "Push") in one request can
      // exceed request/timeout limits — and one bad row would fail the whole
      // batch, re-queuing every set forever. On a batch error, retry per-row
      // so only genuinely failing rows are re-marked dirty.
      const savedSets: Record<string, unknown>[] = [];
      for (let i = 0; i < ownedSets.length; i += SET_BATCH_SIZE) {
        const chunk = ownedSets.slice(i, i + SET_BATCH_SIZE);
        const { data, error } = await supabase
          .from("sets")
          .upsert(
            chunk.map((s) => toSupabaseSet(s, userId, deviceId)),
            { onConflict: "id" },
          )
          .select();
        if (!error) {
          savedSets.push(...((data ?? []) as Record<string, unknown>[]));
          continue;
        }
        console.warn("[sync] pushToSupabase: sets batch upsert failed, retrying per-row", error);
        for (const s of chunk) {
          const { data: rowData, error: rowErr } = await supabase
            .from("sets")
            .upsert([toSupabaseSet(s, userId, deviceId)], { onConflict: "id" })
            .select();
          if (rowErr) {
            console.error("[sync] pushToSupabase: set upsert error", s.id, rowErr);
            ok = false;
          } else if (rowData?.length) {
            savedSets.push(...(rowData as Record<string, unknown>[]));
          }
        }
      }
      for (const row of savedSets) {
        await db.sets
          .where("id")
          .equals(row.id as string)
          .modify({
            updatedAt: new Date(row.updated_at as string).getTime(),
          });
      }
    }

    if (sharedSets.length) {
      // Collaborative edits to sets shared with me: toSupabaseSetShared omits
      // user_id/group_id so the owner's ownership survives; RLS admits me via the
      // set_share grant. Same batch-then-per-row resilience as the owner path.
      const savedShared: Record<string, unknown>[] = [];
      for (let i = 0; i < sharedSets.length; i += SET_BATCH_SIZE) {
        const chunk = sharedSets.slice(i, i + SET_BATCH_SIZE);
        const { data, error } = await supabase
          .from("sets")
          .upsert(
            chunk.map((s) => toSupabaseSetShared(s, deviceId)),
            { onConflict: "id" },
          )
          .select();
        if (!error) {
          savedShared.push(...((data ?? []) as Record<string, unknown>[]));
          continue;
        }
        console.warn(
          "[sync] pushToSupabase: shared sets batch upsert failed, retrying per-row",
          error,
        );
        for (const s of chunk) {
          const { data: rowData, error: rowErr } = await supabase
            .from("sets")
            .upsert([toSupabaseSetShared(s, deviceId)], { onConflict: "id" })
            .select();
          if (rowErr) {
            console.error("[sync] pushToSupabase: shared set upsert error", s.id, rowErr);
            ok = false;
          } else if (rowData?.length) {
            savedShared.push(...(rowData as Record<string, unknown>[]));
          }
        }
      }
      for (const row of savedShared) {
        await db.sets
          .where("id")
          .equals(row.id as string)
          .modify({
            updatedAt: new Date(row.updated_at as string).getTime(),
          });
      }
    }

    // Foreign (group) gatherings take the collaborative push (no user_id
    // rewrite); my own gatherings take the owner push, which also handles the
    // stranded-duplicate / foreign-id re-ID guards.
    const ownedGatherings = gatherings.filter((p) => !p.shared);
    const sharedGatherings = gatherings.filter((p) => p.shared);

    if (gatherings.length) {
      // Gatherings that actually landed in Supabase. A failed parent must be
      // excluded from the gathering_sets rewrite below, or its join rows fail RLS.
      const pushedGatherings: Gathering[] = [];
      const savedGatherings: Record<string, unknown>[] = [];

      if (ownedGatherings.length) {
        const { data, error: gErr } = await supabase
          .from("gatherings")
          .upsert(
            ownedGatherings.map((p) => toSupabaseGathering(p, userId, deviceId)),
            { onConflict: "id" },
          )
          .select();
        if (!gErr) {
          savedGatherings.push(...((data ?? []) as Record<string, unknown>[]));
          pushedGatherings.push(...ownedGatherings);
        } else {
          // Race/leftover guard: a 23505 share_token collision means a synced
          // gathering already owns that token under a different id — this local copy
          // is a stranded duplicate. Retry per-row: drop the colliding local copy,
          // keep pushing the rest. Mirrors the applyMerge guard.
          console.error("[sync] pushToSupabase: gatherings upsert error — retrying per-row", gErr);
          for (const p of ownedGatherings) {
            const { data: rowData, error: rowErr } = await supabase
              .from("gatherings")
              .upsert([toSupabaseGathering(p, userId, deviceId)], { onConflict: "id" })
              .select();
            if (!rowErr) {
              pushedGatherings.push(p);
              if (rowData?.length) savedGatherings.push(...(rowData as Record<string, unknown>[]));
            } else if (rowErr.code === "23505") {
              console.warn(
                "[sync] pushToSupabase: dropping stranded duplicate gathering (token collision):",
                p.id,
              );
              await db.gatherings.delete(p.id);
            } else if (rowErr.code === "42501") {
              // Id owned by ANOTHER account (imported .phyto with gatherings, or
              // a different account once used this browser): the conflict-update
              // hits their row and RLS rejects it on every retry, forever. Re-ID
              // the local copy (fresh share_token too) and push it as this
              // account's own row. Mirrors the applyMerge guard.
              console.warn(
                "[sync] pushToSupabase: re-IDing gathering owned by another account:",
                p.id,
              );
              const reIded = { ...p, id: crypto.randomUUID() as string, share_token: nanoid(10) };
              await db.gatherings.delete(p.id);
              await db.gatherings.put(reIded);
              const { data: reData, error: reErr } = await supabase
                .from("gatherings")
                .upsert([toSupabaseGathering(reIded, userId, deviceId)], { onConflict: "id" })
                .select();
              if (!reErr) {
                pushedGatherings.push(reIded);
                if (reData?.length) savedGatherings.push(...(reData as Record<string, unknown>[]));
              } else {
                console.error(
                  "[sync] pushToSupabase: re-IDed gathering upsert error",
                  reIded.id,
                  reErr,
                );
                ok = false;
              }
            } else {
              console.error("[sync] pushToSupabase: gathering upsert error", p.id, rowErr);
              ok = false;
            }
          }
        }
      }

      if (sharedGatherings.length) {
        // Collaborative edits to a group's gatherings. These rows ALREADY exist
        // remotely (owned by another member), so this is an UPDATE keyed on id,
        // never an upsert — an insert would carry a null user_id and be rejected
        // by RLS (42501), which would then reschedule forever. A row I can't write
        // (removed from the group, or it was deleted) simply matches zero rows
        // with NO error; syncGroups reconciles my local copy afterwards. The
        // payload omits user_id (owner survives) and is_live (server state).
        for (const p of sharedGatherings) {
          const { id: _id, ...patch } = toSupabaseGatheringShared(p, deviceId);
          const { data: rowData, error: rowErr } = await supabase
            .from("gatherings")
            .update(patch)
            .eq("id", p.id)
            .select();
          if (rowErr) {
            // Permanent (RLS) errors must NOT set ok=false, or the dirty-id retry
            // in store.ts loops. Log and move on; syncGroups is the safety net.
            console.error("[sync] pushToSupabase: shared gathering update error", p.id, rowErr);
          } else if (rowData?.length) {
            pushedGatherings.push(p);
            savedGatherings.push(...(rowData as Record<string, unknown>[]));
          }
        }
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

      // Atomic rewrite per gathering (see writeGatheringSetRows): in-place
      // deterministic upsert, then trim removed tail positions.
      for (const p of gatheringsToSync) {
        if (!(await writeGatheringSetRows(p))) ok = false;
      }
    }

    setStatus("synced");
    // Nudge other members to re-pull now (realtime), so group edits land in ~a
    // second instead of on the 12s fallback poll. Cross-tab consistency on THIS
    // device is handled by the Dexie liveQuery in store.ts.
    const changedGroups = new Set<string>();
    for (const s of sets) for (const g of s.groupIds ?? []) changedGroups.add(g);
    for (const p of gatherings) if (p.group_id) changedGroups.add(p.group_id);
    if (changedGroups.size) pingGroupsChanged([...changedGroups]);
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
    // Local gains remote-only items and adopts remote versions of conflicts;
    // remote deletions propagate here (local copies removed).
    effects.local.added.sets = diff.onlyRemote.sets.map((s) => s.name);
    effects.local.added.gatherings = diff.onlyRemote.gatherings.map((p) => p.name);
    effects.local.updated.sets = diff.modified.sets.map(({ remote }) => remote.name);
    effects.local.updated.gatherings = diff.modified.gatherings.map(({ remote }) => remote.name);
    effects.local.removed.sets = diff.remotelyDeleted.sets.map((s) => s.name);
    effects.local.removed.gatherings = diff.remotelyDeleted.gatherings.map((p) => p.name);
    // Account gains the local-only items (pushed up).
    effects.account.added.sets = diff.onlyLocal.sets.map((s) => s.name);
    effects.account.added.gatherings = diff.onlyLocal.gatherings.map((p) => p.name);
  } else if (action === "push") {
    // Account becomes an exact mirror of local: gains local-only items (and
    // resurrects remotely-deleted ones this device still holds), adopts the
    // local version of conflicts, and LOSES items that exist only online.
    effects.account.added.sets = [
      ...diff.onlyLocal.sets.map((s) => s.name),
      ...diff.remotelyDeleted.sets.map((s) => s.name),
    ];
    effects.account.added.gatherings = [
      ...diff.onlyLocal.gatherings.map((p) => p.name),
      ...diff.remotelyDeleted.gatherings.map((p) => p.name),
    ];
    effects.account.updated.sets = diff.modified.sets.map(({ local }) => local.name);
    effects.account.updated.gatherings = diff.modified.gatherings.map(({ local }) => local.name);
    effects.account.removed.sets = diff.onlyRemote.sets.map((s) => s.name);
    effects.account.removed.gatherings = diff.onlyRemote.gatherings.map((p) => p.name);
    // Local is left unchanged.
  } else {
    // replace: local mirrors the account; local-only and remotely-deleted
    // items are deleted.
    effects.local.added.sets = diff.onlyRemote.sets.map((s) => s.name);
    effects.local.added.gatherings = diff.onlyRemote.gatherings.map((p) => p.name);
    effects.local.updated.sets = diff.modified.sets.map(({ remote }) => remote.name);
    effects.local.updated.gatherings = diff.modified.gatherings.map(({ remote }) => remote.name);
    effects.local.removed.sets = [
      ...diff.onlyLocal.sets.map((s) => s.name),
      ...diff.remotelyDeleted.sets.map((s) => s.name),
    ];
    effects.local.removed.gatherings = [
      ...diff.onlyLocal.gatherings.map((p) => p.name),
      ...diff.remotelyDeleted.gatherings.map((p) => p.name),
    ];
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

/** Write deletion tombstones for items just removed from the account, so other
 *  devices still holding a local copy classify it as remotely deleted on their
 *  next diff instead of pushing it back (see `SyncDiff.remotelyDeleted`).
 *  Best-effort: on failure (e.g. the `deletions` table doesn't exist yet) the
 *  delete itself already happened — log and fall back to the old no-tombstone
 *  behavior rather than blocking the deletion. */
export async function recordDeletions(kind: "set" | "gathering", ids: string[]): Promise<void> {
  if (!ids.length) return;
  const session = getSession();
  if (!session) return;
  const { error } = await supabase.from("deletions").upsert(
    ids.map((id) => ({
      id,
      user_id: session.user.id,
      kind,
      deleted_at: new Date().toISOString(),
    })),
    { onConflict: "id" },
  );
  if (error) console.error("[sync] recordDeletions error", kind, error);
}

/** Delete the account-only sets/gatherings named by the diff. `gathering_sets`
 *  rows cascade-delete with their parent (schema.sql `on delete cascade`), so
 *  only the parent rows are removed here. Each successful delete is tombstoned
 *  so a third device holding a copy doesn't push it back. */
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
    else await recordDeletions("gathering", gatheringIds);
  }
  if (setIds.length) {
    const { error } = await supabase.from("sets").delete().in("id", setIds).eq("user_id", userId);
    if (error) console.error("[sync] pushMirror: sets delete error", error);
    else await recordDeletions("set", setIds);
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

// ---------------------------------------------------------------------------
// Collaborative sets (shared with me, two-way). Kept OFF the personal diff/push
// path: foreign rows carry `shared: true` locally, are excluded from
// diffWithSupabase, and are pushed via toSupabaseSetShared (no user_id rewrite).
// ---------------------------------------------------------------------------

/** Attach my user id to any set_shares row addressed to my email but not yet
 *  claimed, so the owner-side `is_set_shared_with` grant (which matches
 *  grantee_user_id) starts admitting me to the set. Call on login. */
export async function claimShares(): Promise<void> {
  const session = getSession();
  const email = session?.user.email;
  if (!email) return;
  const { error } = await supabase
    .from("set_shares")
    .update({ grantee_user_id: session.user.id })
    .eq("grantee_email", email)
    .is("grantee_user_id", null);
  if (error) console.error("[sync] claimShares error", error);
}

export type InboxShare = { shareId: string; set: PhytoSet; ownerEmail: string | null };

/** Shares addressed to me whose set I have NOT saved into my library yet — the
 *  "shared with you" inbox. Returns the full set (for the hover preview) and the
 *  owner's email. Call claimShares first so the set reads are admitted by RLS. */
export async function fetchInboxShares(): Promise<InboxShare[]> {
  const session = getSession();
  if (!session) return [];
  const { data: shares, error } = await supabase
    .from("set_shares")
    .select("id, set_id, owner_email")
    .eq("grantee_user_id", session.user.id);
  if (error) {
    console.error("[sync] fetchInboxShares error", error);
    return [];
  }
  const rows = (shares ?? []) as { id: string; set_id: string; owner_email: string | null }[];
  const saved = new Set((await db.sets.toArray()).map((s) => s.id));
  const pending = rows.filter((r) => !saved.has(r.set_id));
  if (!pending.length) return [];
  const { data: sets, error: setsErr } = await supabase
    .from("sets")
    .select("*")
    .in(
      "id",
      pending.map((r) => r.set_id),
    );
  if (setsErr) {
    console.error("[sync] fetchInboxShares: sets error", setsErr);
    return [];
  }
  const setById = new Map(
    ((sets ?? []) as Record<string, unknown>[]).map((row) => [
      row.id as string,
      fromSupabaseSet(row),
    ]),
  );
  return pending
    .map((r): InboxShare | null => {
      const set = setById.get(r.set_id);
      return set ? { shareId: r.id, set, ownerEmail: r.owner_email } : null;
    })
    .filter((x): x is InboxShare => x !== null);
}

/** Ids of MY sets that I have shared out to at least one person. Used by the
 *  catalogue to mark outgoing shares and include them in the "Shared" filter. */
export async function fetchSharedOutSetIds(): Promise<string[]> {
  const session = getSession();
  if (!session) return [];
  const { data, error } = await supabase
    .from("set_shares")
    .select("set_id")
    .eq("owner_id", session.user.id);
  if (error) {
    console.error("[sync] fetchSharedOutSetIds error", error);
    return [];
  }
  return [...new Set(((data ?? []) as { set_id: string }[]).map((r) => r.set_id))];
}

/** Pull a shared set into my library (the inbox "Save"). Stored with shared:true
 *  (and the owner's email) so it syncs via the collaborative path from now on. */
export async function saveSharedSet(setId: string, ownerEmail?: string | null): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  const { data, error } = await supabase.from("sets").select("*").eq("id", setId).maybeSingle();
  if (error || !data) {
    console.error("[sync] saveSharedSet error", error);
    return false;
  }
  await db.sets.put({
    ...fromSupabaseSet(data as Record<string, unknown>),
    shared: true,
    shared_by: ownerEmail ?? undefined,
  });
  return true;
}

/** Remove a shared set from MY library only: drop my set_share grant and the
 *  local copy. Never touches the owner's set. */
export async function removeSharedSet(setId: string): Promise<void> {
  const session = getSession();
  if (session) {
    const { error } = await supabase
      .from("set_shares")
      .delete()
      .eq("set_id", setId)
      .eq("grantee_user_id", session.user.id);
    if (error) console.error("[sync] removeSharedSet error", error);
  }
  await db.sets.delete(setId);
}

/** Refresh saved shared sets: adopt the owner's newer edits (last-write-wins by
 *  updatedAt) and drop any whose share was revoked or whose set was deleted (no
 *  longer accessible). This is the ONLY pull path for foreign rows, since they
 *  are excluded from the personal diff. Runs under the shared sync lock so it
 *  never interleaves with a personal merge/push. */
export async function syncSharedSets(): Promise<void> {
  const session = getSession();
  if (!session) return;
  await withSyncLock(async () => {
    // ONLY person-shares (set_shares grants). Foreign GROUP sets are also
    // `shared` but are tracked by group_sets and managed by syncGroups — they
    // have no set_shares row, so including them here would wrongly prune them
    // (then syncGroups re-adds them, causing a flicker).
    const localShared = (await db.sets.toArray()).filter(
      (s) => s.shared && (s.groupIds?.length ?? 0) === 0,
    );
    if (!localShared.length) return;

    const { data: shares, error } = await supabase
      .from("set_shares")
      .select("set_id, owner_email")
      .eq("grantee_user_id", session.user.id);
    if (error) {
      console.error("[sync] syncSharedSets: shares error", error);
      return;
    }
    const shareRows = (shares ?? []) as { set_id: string; owner_email: string | null }[];
    const accessible = new Set(shareRows.map((r) => r.set_id));
    const ownerEmailBySet = new Map(shareRows.map((r) => [r.set_id, r.owner_email]));

    // Revoked or deleted upstream: I no longer have the grant → drop my copy.
    const revoked = localShared.filter((s) => !accessible.has(s.id));
    if (revoked.length) await db.sets.bulkDelete(revoked.map((s) => s.id));

    const stillShared = localShared.filter((s) => accessible.has(s.id));
    if (!stillShared.length) return;

    const { data: rows, error: setsErr } = await supabase
      .from("sets")
      .select("*")
      .in(
        "id",
        stillShared.map((s) => s.id),
      );
    if (setsErr) {
      console.error("[sync] syncSharedSets: sets error", setsErr);
      return;
    }
    const localById = new Map(stillShared.map((s) => [s.id, s]));
    const toWrite: PhytoSet[] = [];
    for (const row of (rows ?? []) as Record<string, unknown>[]) {
      const parsed = fromSupabaseSet(row);
      const remote: PhytoSet = {
        ...parsed,
        shared: true,
        shared_by: ownerEmailBySet.get(parsed.id) ?? undefined,
      };
      const local = localById.get(remote.id);
      // Adopt remote only when it's strictly newer, so a local edit still pending
      // its push isn't clobbered.
      if (!local || remote.updatedAt > local.updatedAt) toWrite.push(remote);
    }
    if (toWrite.length) await db.sets.bulkPut(toWrite);
  });
}

// ---------------------------------------------------------------------------
// Group workspaces. A group's sets carry group_id. My OWN contributions
// (user_id = me) flow through the personal engine (they carry group_id and are
// simply shown in the group workspace). OTHER members' contributions are FOREIGN
// — pulled here, tagged shared+group_id, and pushed via the shared-set path.
// ---------------------------------------------------------------------------

export type MyGroup = { id: string; name: string; role: "admin" | "member"; owner_id: string };

/** Groups I belong to (claimed memberships). */
export async function fetchMyGroups(): Promise<MyGroup[]> {
  const session = getSession();
  if (!session) return [];
  const { data, error } = await supabase
    .from("group_members")
    .select("role, groups(id, name, owner_id)")
    .eq("user_id", session.user.id);
  if (error) {
    console.error("[sync] fetchMyGroups error", error);
    return [];
  }
  type G = { id: string; name: string; owner_id: string };
  const rows = (data ?? []) as unknown as { role: string; groups: G | G[] | null }[];
  const out: MyGroup[] = [];
  for (const r of rows) {
    const g = Array.isArray(r.groups) ? r.groups[0] : r.groups;
    if (g) {
      out.push({
        id: g.id,
        name: g.name,
        role: r.role === "admin" ? "admin" : "member",
        owner_id: g.owner_id,
      });
    }
  }
  return out;
}

export type GroupInvite = {
  inviteId: string;
  groupId: string;
  groupName: string;
  invitedByEmail: string | null;
};

/** Pending group invites addressed to my email that I haven't accepted yet
 *  (user_id still NULL) — the "you've been invited" inbox, mirroring set shares.
 *  Requires the group-invite-accept migration so I can read the group's name. */
export async function fetchGroupInvites(): Promise<GroupInvite[]> {
  const session = getSession();
  const email = session?.user.email;
  if (!email) return [];
  const { data, error } = await supabase
    .from("group_members")
    .select("id, group_id, added_by_email, groups(name)")
    .eq("email", email)
    .is("user_id", null);
  if (error) {
    console.error("[sync] fetchGroupInvites error", error);
    return [];
  }
  type G = { name: string };
  const rows = (data ?? []) as unknown as {
    id: string;
    group_id: string;
    added_by_email: string | null;
    groups: G | G[] | null;
  }[];
  const out: GroupInvite[] = [];
  for (const r of rows) {
    const g = Array.isArray(r.groups) ? r.groups[0] : r.groups;
    out.push({
      inviteId: r.id,
      groupId: r.group_id,
      groupName: g?.name ?? "a group",
      invitedByEmail: r.added_by_email ?? null,
    });
  }
  return out;
}

/** Accept a group invite: claim my membership row (set user_id = me). */
export async function acceptGroupInvite(inviteId: string): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  const { error } = await supabase
    .from("group_members")
    .update({ user_id: session.user.id })
    .eq("id", inviteId);
  if (error) {
    console.error("[sync] acceptGroupInvite error", error);
    return false;
  }
  return true;
}

/** Decline a group invite: delete my pending membership row. */
export async function declineGroupInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from("group_members").delete().eq("id", inviteId);
  if (error) console.error("[sync] declineGroupInvite error", error);
}

/** Create a group I own and enroll myself as its admin. Returns the group id. */
export async function createGroup(name: string): Promise<string | null> {
  const session = getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("groups")
    .insert({ name, owner_id: session.user.id })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[sync] createGroup error", error);
    return null;
  }
  const groupId = data.id as string;
  const { error: memErr } = await supabase.from("group_members").insert({
    group_id: groupId,
    user_id: session.user.id,
    email: session.user.email ?? "",
    role: "admin",
    added_by: session.user.id,
  });
  if (memErr) console.error("[sync] createGroup member error", memErr);
  return groupId;
}

/** Rename a group (owner only, enforced by RLS). */
export async function renameGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase.from("groups").update({ name }).eq("id", groupId);
  if (error) console.error("[sync] renameGroup error", error);
}

/** Delete a group (owner only, enforced by RLS). Cascades its memberships and
 *  set grants; the sets themselves are untouched and revert to personal-only.
 *  Returns true on success. */
export async function deleteGroup(groupId: string): Promise<boolean> {
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) {
    console.error("[sync] deleteGroup error", error);
    return false;
  }
  return true;
}

/** Pull FOREIGN group sets (other members' contributions) into Dexie, tagged
 *  shared+group_id, last-write-wins, pruning ones I've lost access to. My own
 *  group sets are handled by the personal engine. Runs under the sync lock. */
export async function syncGroups(): Promise<void> {
  const session = getSession();
  if (!session) return;
  const uid = session.user.id;
  const groupIds = (await fetchMyGroups()).map((g) => g.id);
  await withSyncLock(async () => {
    const local = await db.sets.toArray();
    const localForeignGroup = local.filter((s) => s.shared && (s.groupIds?.length ?? 0) > 0);

    if (!groupIds.length) {
      // Not in any group: drop foreign group sets and clear grants off my own.
      if (localForeignGroup.length) await db.sets.bulkDelete(localForeignGroup.map((s) => s.id));
      const myGranted = local.filter((s) => !s.shared && (s.groupIds?.length ?? 0) > 0);
      if (myGranted.length) await db.sets.bulkPut(myGranted.map((s) => ({ ...s, groupIds: [] })));
      // ...and drop any foreign group gatherings I was seeing.
      const foreignGath = (await db.gatherings.toArray()).filter((p) => p.shared);
      if (foreignGath.length) await db.gatherings.bulkDelete(foreignGath.map((p) => p.id));
      return;
    }

    // Every grant for the groups I'm in.
    const { data: grantRows, error: grantErr } = await supabase
      .from("group_sets")
      .select("group_id, set_id, owner_id, owner_email")
      .in("group_id", groupIds);
    if (grantErr) {
      console.error("[sync] syncGroups grants error", grantErr);
      return;
    }
    const grants = (grantRows ?? []) as {
      group_id: string;
      set_id: string;
      owner_id: string;
      owner_email: string | null;
    }[];
    const groupsBySet = new Map<string, string[]>();
    const ownerEmailBySet = new Map<string, string | null>();
    for (const g of grants) {
      const arr = groupsBySet.get(g.set_id) ?? [];
      arr.push(g.group_id);
      groupsBySet.set(g.set_id, arr);
      ownerEmailBySet.set(g.set_id, g.owner_email);
    }
    const sameSet = (a: string[], b: string[]) =>
      a.length === b.length && a.every((x) => b.includes(x));

    // 1) My own sets: mirror their grants into local groupIds (so they appear in
    //    the group views), clearing ones no longer granted.
    const myUpdates: PhytoSet[] = [];
    for (const s of local) {
      if (s.shared) continue;
      const desired = groupsBySet.get(s.id) ?? [];
      if (!sameSet(desired, s.groupIds ?? [])) myUpdates.push({ ...s, groupIds: desired });
    }
    if (myUpdates.length) await db.sets.bulkPut(myUpdates);

    // 2) Foreign granted sets (owned by others): pull content + tag.
    const foreignSetIds = [
      ...new Set(grants.filter((g) => g.owner_id !== uid).map((g) => g.set_id)),
    ];
    const localForeignById = new Map(localForeignGroup.map((s) => [s.id, s]));
    if (foreignSetIds.length) {
      const { data: setRows, error: setErr } = await supabase
        .from("sets")
        .select("*")
        .in("id", foreignSetIds);
      if (setErr) {
        console.error("[sync] syncGroups sets error", setErr);
        return;
      }
      const toWrite: PhytoSet[] = [];
      for (const row of (setRows ?? []) as Record<string, unknown>[]) {
        const parsed = fromSupabaseSet(row);
        const gids = groupsBySet.get(parsed.id) ?? [];
        const email = ownerEmailBySet.get(parsed.id) ?? undefined;
        const localCopy = localForeignById.get(parsed.id);
        if (!localCopy || parsed.updatedAt > localCopy.updatedAt) {
          // Remote content wins.
          toWrite.push({ ...parsed, shared: true, groupIds: gids, shared_by: email });
        } else if (!sameSet(gids, localCopy.groupIds ?? []) || localCopy.shared_by !== email) {
          // My local content is newer/equal (a pending edit) — keep it, refresh tags.
          toWrite.push({ ...localCopy, groupIds: gids, shared_by: email });
        }
      }
      if (toWrite.length) await db.sets.bulkPut(toWrite);
    }
    // Prune foreign group sets no longer granted to me.
    const accessible = new Set(foreignSetIds);
    const gone = localForeignGroup.filter((s) => !accessible.has(s.id));
    if (gone.length) await db.sets.bulkDelete(gone.map((s) => s.id));

    // ── Group GATHERINGS (collaborative, last-write-wins) ─────────────────────
    // ALL group gatherings sync here, not the personal diff, so a group gathering
    // never raises the review-versions dialog. Foreign ones (other members') are
    // tagged `shared`; my own stay owned (pushed by doPush's owner path) but I
    // still PULL other members' edits to them here.
    const { data: gathRows, error: gathErr } = await supabase
      .from("gatherings")
      .select("*")
      .in("group_id", groupIds);
    if (gathErr) {
      console.error("[sync] syncGroups gatherings error", gathErr);
      return;
    }
    const remoteGathRows = (gathRows ?? []) as Record<string, unknown>[];
    const localGath = await db.gatherings.toArray();
    const localGathById = new Map(localGath.map((p) => [p.id, p]));
    const localForeignGath = localGath.filter((p) => p.shared);

    if (remoteGathRows.length) {
      // Ordered set lists (gathering_sets), grouped + sorted by position.
      const gathIds = remoteGathRows.map((r) => r.id as string);
      const { data: gsRows } = await supabase
        .from("gathering_sets")
        .select("gathering_id, set_id, position")
        .in("gathering_id", gathIds);
      const setIdsByGathering = new Map<string, string[]>();
      for (const row of (gsRows ?? []) as {
        gathering_id: string;
        set_id: string;
        position: number;
      }[]) {
        const arr = setIdsByGathering.get(row.gathering_id) ?? [];
        arr[row.position] = row.set_id;
        setIdsByGathering.set(row.gathering_id, arr);
      }
      const toWrite: Gathering[] = [];
      for (const row of remoteGathRows) {
        const mine = row.user_id === uid;
        const ids = (setIdsByGathering.get(row.id as string) ?? []).filter(Boolean);
        const parsed = fromSupabaseGathering(row, ids);
        const localCopy = localGathById.get(parsed.id);
        // Last-write-wins by content updatedAt. `shared` marks foreign rows only
        // (mine stay owned). is_live/live_started_at always adopt the server's
        // (session state is authoritative, never a content conflict).
        const tag = (g: Gathering): Gathering =>
          mine ? { ...g, shared: undefined } : { ...g, shared: true };
        if (!localCopy || parsed.updatedAt > localCopy.updatedAt) {
          toWrite.push(tag(parsed));
        } else if (
          localCopy.is_live !== parsed.is_live ||
          localCopy.live_started_at !== parsed.live_started_at
        ) {
          toWrite.push({
            ...localCopy,
            is_live: parsed.is_live,
            live_started_at: parsed.live_started_at,
          });
        }
      }
      if (toWrite.length) await db.gatherings.bulkPut(toWrite);
    }
    // Prune FOREIGN group gatherings I've lost access to (removed/left/deleted by
    // the owner). My own are never pruned here: a freshly created one isn't remote
    // yet, and deletion of mine is handled by deleteGathering.
    const accessibleGath = new Set(remoteGathRows.map((r) => r.id as string));
    const goneGath = localForeignGath.filter((p) => !accessibleGath.has(p.id));
    if (goneGath.length) await db.gatherings.bulkDelete(goneGath.map((p) => p.id));
  });
}

/** Share one of my sets to a group (a grant). Idempotent. */
export async function shareSetToGroup(setId: string, groupId: string): Promise<void> {
  const session = getSession();
  if (!session) return;
  const { error } = await supabase.from("group_sets").upsert(
    {
      group_id: groupId,
      set_id: setId,
      owner_id: session.user.id,
      owner_email: session.user.email ?? null,
    },
    { onConflict: "group_id,set_id", ignoreDuplicates: true },
  );
  if (error) console.error("[sync] shareSetToGroup error", error);
}

/** Remove a set from a group (retract). Allowed for the owner or group admin. */
export async function removeSetFromGroup(setId: string, groupId: string): Promise<void> {
  const { error } = await supabase
    .from("group_sets")
    .delete()
    .eq("set_id", setId)
    .eq("group_id", groupId);
  if (error) console.error("[sync] removeSetFromGroup error", error);
}

export type GroupMember = {
  id: string;
  email: string;
  role: "admin" | "member";
  /** Invited but hasn't signed in to claim the membership yet. */
  pending: boolean;
  /** True for the current user's own row. */
  isMe: boolean;
  /** The claimed member's user id, or null while the invite is still pending. */
  userId: string | null;
};

/** The roster of a group (owner + members + pending invitees). */
export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const session = getSession();
  const { data, error } = await supabase
    .from("group_members")
    .select("id, email, role, user_id")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[sync] fetchGroupMembers error", error);
    return [];
  }
  const rows = (data ?? []) as {
    id: string;
    email: string;
    role: string;
    user_id: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role === "admin" ? "admin" : "member",
    pending: !r.user_id,
    isMe: !!session && r.user_id === session.user.id,
    userId: r.user_id,
  }));
}

/** The names of the sets a member granted to a group. Used to warn the owner,
 *  before removing that member, which sets will leave the group with them. */
export async function fetchMemberGroupSetNames(
  groupId: string,
  memberUserId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("group_sets")
    .select("sets(name)")
    .eq("group_id", groupId)
    .eq("owner_id", memberUserId);
  if (error) {
    console.error("[sync] fetchMemberGroupSetNames error", error);
    return [];
  }
  type S = { name: string | null };
  const rows = (data ?? []) as unknown as { sets: S | S[] | null }[];
  return rows
    .map((r) => {
      const s = Array.isArray(r.sets) ? r.sets[0] : r.sets;
      return s?.name ?? "";
    })
    .filter((n) => n.trim());
}

export type InviteResult = "ok" | "self" | "exists" | "error";

/** Invite someone to a group by email (owner only, enforced by RLS). The row is
 *  created PENDING (user_id NULL) regardless of whether they have an account;
 *  they accept or decline from their invite inbox on their next visit. Best-
 *  effort invite email. */
export async function inviteGroupMember(groupId: string, rawEmail: string): Promise<InviteResult> {
  const session = getSession();
  if (!session) return "error";
  const email = rawEmail.trim().toLowerCase();
  if (!email) return "error";
  if (email === (session.user.email ?? "").toLowerCase()) return "self";

  const { error, count } = await supabase.from("group_members").upsert(
    {
      group_id: groupId,
      email,
      role: "member",
      added_by: session.user.id,
      added_by_email: session.user.email ?? null,
      user_id: null,
    },
    { onConflict: "group_id,email", ignoreDuplicates: true, count: "exact" },
  );
  if (error) {
    console.error("[sync] inviteGroupMember error", error);
    return "error";
  }
  if (count === 0) return "exists"; // already invited/a member

  // Best-effort invite email; the membership stands regardless.
  try {
    const groupName = (await fetchMyGroups()).find((g) => g.id === groupId)?.name;
    await fetch("/api/groups/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ownerEmail: session.user.email, groupName }),
    });
  } catch {
    // Ignore: the membership exists whether or not the email sends.
  }
  return "ok";
}

/** Remove a member from a group by email (owner only, enforced by RLS). Their
 *  contributions leave the group with them, exactly as if they had left: their
 *  grants are retracted and their sets are stripped from the group's gatherings.
 *  Their own set copies stay in their personal library (no strings attached).
 *  Pass their user id so we can find their grants; a pending invitee has none. */
export async function removeGroupMember(
  groupId: string,
  email: string,
  memberUserId?: string | null,
): Promise<void> {
  // Pull their contributions first, while their grants still exist.
  if (memberUserId) {
    await removeMemberContributionsFromGroup(groupId, memberUserId);
    pingGroupsChanged([groupId]);
  }
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("email", email.toLowerCase());
  if (error) console.error("[sync] removeGroupMember error", error);
}

/** Pull MY contributions out of a group: delete my set grants to it, and remove
 *  my sets from the group's gatherings (bumping those gatherings so members see
 *  them go). Run this BEFORE deleting my membership, while I still have access.
 *  My own sets stay in my personal library; only their group membership is
 *  removed. */
export async function removeMyContributionsFromGroup(groupId: string): Promise<void> {
  const session = getSession();
  if (!session) return;
  await pullContributionsFromGroup(groupId, session.user.id);
}

/** Pull a specific member's contributions out of a group: the same retraction
 *  as {@link removeMyContributionsFromGroup}, applied to someone else. The group
 *  owner is allowed to delete another member's grants and the group gatherings'
 *  set rows (both RLS-permitted for the owner), so this runs client-side when
 *  the owner removes a member. Their own set copies stay in their library. */
export async function removeMemberContributionsFromGroup(
  groupId: string,
  memberUserId: string,
): Promise<void> {
  await pullContributionsFromGroup(groupId, memberUserId);
}

/** Shared core: retract the sets `ownerUid` granted to the group and strip them
 *  from the group's gatherings. Works for me (self-leave) or for a member the
 *  group owner is removing. */
async function pullContributionsFromGroup(groupId: string, ownerUid: string): Promise<void> {
  // Which of this member's sets are granted to this group?
  const { data: grants } = await supabase
    .from("group_sets")
    .select("set_id")
    .eq("group_id", groupId)
    .eq("owner_id", ownerUid);
  const mySetIds = ((grants ?? []) as { set_id: string }[]).map((r) => r.set_id);

  if (mySetIds.length) {
    // The group's gatherings, and which of them reference my sets.
    const { data: gathRows } = await supabase
      .from("gatherings")
      .select("id")
      .eq("group_id", groupId);
    const gathIds = ((gathRows ?? []) as { id: string }[]).map((r) => r.id);
    if (gathIds.length) {
      const { data: affected } = await supabase
        .from("gathering_sets")
        .select("gathering_id")
        .in("gathering_id", gathIds)
        .in("set_id", mySetIds);
      const affectedGathIds = [
        ...new Set(((affected ?? []) as { gathering_id: string }[]).map((r) => r.gathering_id)),
      ];
      if (affectedGathIds.length) {
        // Remove my sets from those gatherings. Positions left with gaps are
        // read back compact (filter(Boolean)) and rewritten on the next edit.
        const { error: delErr } = await supabase
          .from("gathering_sets")
          .delete()
          .in("gathering_id", affectedGathIds)
          .in("set_id", mySetIds);
        if (delErr) console.error("[sync] removeMyContributions gathering_sets error", delErr);
        // Bump so every member's syncGroups adopts the shortened set list.
        const { error: bumpErr } = await supabase
          .from("gatherings")
          .update({ updated_at: new Date().toISOString() })
          .in("id", affectedGathIds);
        if (bumpErr) console.error("[sync] removeMyContributions bump error", bumpErr);
      }
    }
  }

  // Finally retract the set grants: those sets leave the group.
  const { error: grantErr } = await supabase
    .from("group_sets")
    .delete()
    .eq("group_id", groupId)
    .eq("owner_id", ownerUid);
  if (grantErr) console.error("[sync] pullContributions grants error", grantErr);
}

/** Leave a group I'm in (deletes only my own membership row). Returns true on
 *  success. Call removeMyContributionsFromGroup first if my sets should leave
 *  with me. */
export async function leaveGroup(groupId: string): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", session.user.id);
  if (error) {
    console.error("[sync] leaveGroup error", error);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Realtime group signalling (Supabase Broadcast)
//
// Broadcast is a lightweight pub/sub that needs no table publication or realtime
// RLS setup. It carries NO row data — just a "something in this group changed"
// ping. On receipt, a client re-pulls authoritatively through the RLS-protected
// syncGroups, so the ping can never leak content. This makes collaborative edits
// appear in ~a second instead of waiting for the 12s fallback poll.
// ─────────────────────────────────────────────────────────────────────────────

type GroupChannel = ReturnType<typeof supabase.channel>;
const groupChannels = new Map<string, GroupChannel>();
let onGroupChange: (() => void) | null = null;

/** Set the callback fired when any subscribed group gets a change ping. */
export function setGroupChangeHandler(fn: (() => void) | null): void {
  onGroupChange = fn;
}

/** Subscribe to change pings for exactly `groupIds` (idempotent): opens channels
 *  for new groups and closes ones we've left. */
export function syncGroupChannels(groupIds: string[]): void {
  for (const [id, ch] of groupChannels) {
    if (!groupIds.includes(id)) {
      supabase.removeChannel(ch);
      groupChannels.delete(id);
    }
  }
  for (const id of groupIds) {
    if (groupChannels.has(id)) continue;
    const ch = supabase
      .channel(`group-sync:${id}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "changed" }, () => onGroupChange?.())
      .subscribe();
    groupChannels.set(id, ch);
  }
}

/** Close every group channel (call on sign-out). */
export function stopGroupChannels(): void {
  for (const [, ch] of groupChannels) supabase.removeChannel(ch);
  groupChannels.clear();
}

/** Tell the other members of these groups that something changed, so they
 *  re-pull immediately. Best-effort: only groups we already have a channel for. */
export function pingGroupsChanged(groupIds: string[]): void {
  for (const id of new Set(groupIds)) {
    const ch = groupChannels.get(id);
    if (ch) ch.send({ type: "broadcast", event: "changed", payload: {} });
  }
}
