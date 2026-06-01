import { supabase } from './supabase';
import { useAuthStore } from './authStore';
import { db } from './db';
import type { Set as PhytoSet, Playlist } from './types';
import { useSyncStatusStore } from '../hooks/use-sync-status';
import { nanoid } from 'nanoid';

// Deterministic UUID v5-like from two strings using SubtleCrypto.
// Used to generate stable UUIDs for gathering_sets rows from (gathering_id, position).
async function deterministicUuid(a: string, b: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${a}:${b}`));
  const hex = Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSession() {
  return useAuthStore.getState().session;
}

/** Returns a stable device ID, generated once and persisted in localStorage. */
function getDeviceId(): string {
  const key = 'phyto-device-id';
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

function toSupabaseGathering(p: Playlist, userId: string, deviceId: string) {
  console.log('[toSupabaseGathering] pushing gathering', p.id, '| is_live:', p.is_live, '| updatedAt:', new Date(p.updatedAt).toISOString());
  return {
    id: p.id,
    user_id: userId,
    title: p.name,
    share_token: p.share_token,
    is_live: p.is_live,
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
    kind: row.type as PhytoSet['kind'],
    slides: (content.slides as PhytoSet['slides']) ?? [],
    template: content.template as PhytoSet['template'],
    autoAdvanceMs: content.autoAdvanceMs as number | undefined,
    loop: content.loop as boolean | undefined,
    dissolveMs: content.dissolveMs as number | undefined,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

function fromSupabaseGathering(
  row: Record<string, unknown>,
  setIds: string[],
): Playlist {
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
// BroadcastChannel — cross-tab coordination
// ---------------------------------------------------------------------------

const SYNC_CHANNEL = 'phyto-sync-channel';
let syncChannel: BroadcastChannel | null = null;

let remoteSyncedRecently = false;

function getSyncChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!syncChannel) {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL);
    syncChannel.addEventListener('message', async (e) => {
      if (e.data?.type === 'sync-complete') {
        console.log('[sync] received sync-complete from another tab — refreshing from Dexie');
        remoteSyncedRecently = true;
        const { useLibrary } = await import('./store');
        await useLibrary.getState().loadFromDb();
        useSyncStatusStore.getState().setStatus('synced');
        setTimeout(() => { remoteSyncedRecently = false; }, 1000);
      }
    });
  }
  return syncChannel;
}

if (typeof window !== 'undefined') getSyncChannel();

export function shouldSkipPush(): boolean {
  return remoteSyncedRecently;
}

// ---------------------------------------------------------------------------
// Fetch remote sets + gatherings (shared by diff and apply functions)
// ---------------------------------------------------------------------------

async function fetchRemote(userId: string) {
  const [setsRes, gatheringsRes, gatheringSetsRes] = await Promise.all([
    supabase.from('sets').select('*').eq('user_id', userId),
    supabase.from('gatherings').select('*').eq('user_id', userId),
    supabase.from('gathering_sets').select('*'),
  ]);

  if (setsRes.error) console.error('[sync] fetchRemote: sets error', setsRes.error);
  if (gatheringsRes.error) console.error('[sync] fetchRemote: gatherings error', gatheringsRes.error);

  const gsRows = (gatheringSetsRes.data ?? []) as {
    gathering_id: string;
    set_id: string;
    position: number;
  }[];
  const setIdsByGathering = new Map<string, string[]>();
  for (const row of gsRows) {
    const arr = setIdsByGathering.get(row.gathering_id) ?? [];
    arr[row.position] = row.set_id;
    setIdsByGathering.set(row.gathering_id, arr);
  }

  const sets = (setsRes.data ?? []).map((r) => fromSupabaseSet(r as Record<string, unknown>));
  const gatherings = (gatheringsRes.data ?? []).map((r) =>
    fromSupabaseGathering(
      r as Record<string, unknown>,
      (setIdsByGathering.get((r as Record<string, unknown>).id as string) ?? []).filter(Boolean),
    )
  );

  return { sets, gatherings };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type SyncDiff = {
  onlyLocal: { sets: PhytoSet[]; gatherings: Playlist[] };
  onlyRemote: { sets: PhytoSet[]; gatherings: Playlist[] };
  modified: {
    sets: { local: PhytoSet; remote: PhytoSet }[];
    gatherings: { local: Playlist; remote: Playlist }[];
  };
};

export function hasDifferences(diff: SyncDiff): boolean {
  return (
    diff.onlyLocal.sets.length > 0 ||
    diff.onlyLocal.gatherings.length > 0 ||
    diff.onlyRemote.sets.length > 0 ||
    diff.onlyRemote.gatherings.length > 0 ||
    diff.modified.sets.length > 0 ||
    diff.modified.gatherings.length > 0
  );
}

export function latestRemoteTime(diff: SyncDiff): Date | null {
  const times = [
    ...diff.onlyRemote.sets.map((s) => s.updatedAt),
    ...diff.onlyRemote.gatherings.map((p) => p.updatedAt),
    ...diff.modified.sets.map(({ remote }) => remote.updatedAt),
    ...diff.modified.gatherings.map(({ remote }) => remote.updatedAt),
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

  return {
    onlyLocal: {
      sets: localSets.filter((s) => !remoteSetMap.has(s.id)),
      gatherings: localGatherings.filter((p) => !remoteGatheringMap.has(p.id)),
    },
    onlyRemote: {
      sets: remoteSets.filter((s) => !localSetMap.has(s.id)),
      gatherings: remoteGatherings.filter((p) => !localGatheringMap.has(p.id)),
    },
    modified: {
      sets: remoteSets
        .filter((s) => {
          const local = localSetMap.get(s.id);
          return local && Math.round(local.updatedAt / 1000) !== Math.round(s.updatedAt / 1000);
        })
        .map((s) => ({ local: localSetMap.get(s.id)!, remote: s })),
      gatherings: remoteGatherings
        .filter((p) => {
          const local = localGatheringMap.get(p.id);
          return local && Math.round(local.updatedAt / 1000) !== Math.round(p.updatedAt / 1000);
        })
        .map((p) => ({ local: localGatheringMap.get(p.id)!, remote: p })),
    },
  };
}

// ---------------------------------------------------------------------------
// Conflict resolution: Merge (remote wins for modified)
// ---------------------------------------------------------------------------

export async function applyMerge(diff: SyncDiff): Promise<void> {
  const session = getSession();

  // Merge = "accept remote." Write ALL remote items (remote-only and every modified)
  // to Dexie regardless of timestamps — user chose to receive the Supabase version.
  const setsToWrite = [
    ...diff.onlyRemote.sets,
    ...diff.modified.sets.map(({ remote }) => remote),
  ];
  const gatheringsToWrite = [
    ...diff.onlyRemote.gatherings,
    ...diff.modified.gatherings.map(({ remote }) => remote),
  ];
  if (setsToWrite.length) await db.sets.bulkPut(setsToWrite);
  if (gatheringsToWrite.length) {
    try {
      await db.gatherings.bulkPut(gatheringsToWrite);
    } catch {
      for (const p of gatheringsToWrite) {
        try { await db.gatherings.put(p); } catch (e) {
          console.error('[applyMerge] Dexie put failed for gathering:', p.id, e);
        }
      }
    }
  }

  // Push only-local items (items Supabase doesn't know about at all)
  if (session) {
    const userId = session.user.id;
    const deviceId = getDeviceId();

    if (diff.onlyLocal.sets.length) {
      const { error } = await supabase
        .from('sets')
        .upsert(diff.onlyLocal.sets.map((s) => toSupabaseSet(s, userId, deviceId)), { onConflict: 'id' });
      if (error) console.error('[applyMerge] sets upsert error:', error);
    }

    if (diff.onlyLocal.gatherings.length) {
      const { error } = await supabase
        .from('gatherings')
        .upsert(diff.onlyLocal.gatherings.map((p) => toSupabaseGathering(p, userId, deviceId)), { onConflict: 'id' });
      if (error) console.error('[applyMerge] gatherings upsert error:', error);

      const gatheringSetRows = await Promise.all(
        diff.onlyLocal.gatherings.flatMap((p) =>
          p.setIds.map(async (setId, i) => ({
            id: await deterministicUuid(p.id, String(i)),
            gathering_id: p.id,
            set_id: setId,
            position: i,
          }))
        )
      );
      if (gatheringSetRows.length) {
        const { error: gsErr } = await supabase
          .from('gathering_sets')
          .upsert(gatheringSetRows, { onConflict: 'id' });
        if (gsErr) console.error('[applyMerge] gathering_sets upsert error:', gsErr);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Push local → Supabase
// ---------------------------------------------------------------------------

async function doPush(userId: string): Promise<void> {
  const { setStatus } = useSyncStatusStore.getState();
  const deviceId = getDeviceId();

  console.log('[sync] pushToSupabase: starting push for user', userId, 'device', deviceId);
  setStatus('syncing');
  try {
    const [sets, gatherings] = await Promise.all([
      db.sets.toArray(),
      db.gatherings.toArray(),
    ]);

    console.log('[sync] pushToSupabase: pushing', sets.length, 'sets,', gatherings.length, 'gatherings');

    if (sets.length) {
      const { data: savedSets, error } = await supabase
        .from('sets')
        .upsert(sets.map((s) => toSupabaseSet(s, userId, deviceId)), { onConflict: 'id' })
        .select();
      if (error) console.error('[sync] pushToSupabase: sets upsert error', error);
      if (savedSets?.length) {
        for (const row of savedSets as Record<string, unknown>[]) {
          await db.sets.where('id').equals(row.id as string).modify({
            updatedAt: new Date(row.updated_at as string).getTime(),
          });
        }
      }
    }

    if (gatherings.length) {
      const { data: savedGatherings, error: gErr } = await supabase
        .from('gatherings')
        .upsert(gatherings.map((p) => toSupabaseGathering(p, userId, deviceId)), { onConflict: 'id' })
        .select();
      if (gErr) console.error('[sync] pushToSupabase: gatherings upsert error', gErr);
      // Sync server-side timestamps back to Dexie. The server may have a trigger
      // that updates updated_at, so we need the exact value Supabase stored —
      // otherwise the next diff sees a stale local timestamp and fires a false conflict.
      // We only update the timestamp field, not setIds (gathering_sets haven't been
      // written yet so reading them back would produce the wrong order).
      if (savedGatherings?.length) {
        for (const row of savedGatherings as Record<string, unknown>[]) {
          await db.gatherings.where('id').equals(row.id as string).modify({
            updatedAt: new Date(row.updated_at as string).getTime(),
          });
        }
      }

      const { data: existingGs } = await supabase
        .from('gathering_sets')
        .select('set_id, position, gathering_id')
        .in('gathering_id', gatherings.map((p) => p.id));

      const existingByGathering = new Map<string, string[]>();
      for (const row of (existingGs ?? []) as { gathering_id: string; set_id: string; position: number }[]) {
        const arr = existingByGathering.get(row.gathering_id) ?? [];
        arr[row.position] = row.set_id;
        existingByGathering.set(row.gathering_id, arr);
      }

      // Always sync all gatherings — local state is authoritative during a push.
      const gatheringsToSync = gatherings;

      const gatheringSetRows = await Promise.all(
        gatheringsToSync.flatMap((p) =>
          p.setIds.map(async (setId, i) => ({
            id: await deterministicUuid(p.id, String(i)),
            gathering_id: p.id,
            set_id: setId,
            position: i,
          }))
        )
      );

      if (gatheringSetRows.length) {
        const { error: delErr } = await supabase
          .from('gathering_sets')
          .delete()
          .in('gathering_id', gatheringsToSync.map((p) => p.id));
        if (delErr) console.error('[sync] pushToSupabase: gathering_sets delete error', delErr);

        const { error: insErr } = await supabase.from('gathering_sets').insert(gatheringSetRows);
        if (insErr) console.error('[sync] pushToSupabase: gathering_sets insert error', insErr);
      }
    }

    console.log('[sync] pushToSupabase: done');
    setStatus('synced');
    getSyncChannel()?.postMessage({ type: 'sync-complete' });
  } catch (e) {
    console.error('[sync] pushToSupabase: unexpected error', e);
    setStatus('synced');
  }
}

export async function pushToSupabase(): Promise<void> {
  const session = getSession();
  if (!session) {
    console.log('[sync] pushToSupabase: skipped — no session');
    return;
  }
  const userId = session.user.id;

  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request('phyto-sync', async () => {
      await doPush(userId);
    });
  } else {
    await doPush(userId);
  }
}
