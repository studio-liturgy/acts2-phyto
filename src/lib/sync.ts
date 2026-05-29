import { supabase } from './supabase';
import { useAuthStore } from './authStore';
import { db } from './db';
import type { Set as PhytoSet, Playlist } from './types';
import { useSyncStatusStore } from '../hooks/use-sync-status';

// Deterministic UUID v5-like from two strings using SubtleCrypto.
// Used to generate stable UUIDs for gathering_sets rows from (gathering_id, position).
async function deterministicUuid(a: string, b: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${a}:${b}`));
  const hex = Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
  // Format as UUID: 8-4-4-4-12
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSession() {
  return useAuthStore.getState().session;
}

// Only include columns that exist in the Supabase schema for `sets`:
// id, user_id, title, type, content, created_at, updated_at, synced_at
function toSupabaseSet(s: PhytoSet, userId: string) {
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
  };
}

// Only include columns that exist in the Supabase schema for `gatherings`:
// id, user_id, title, share_token, is_live, current_set_index, current_slide_index, created_at, updated_at
function toSupabaseGathering(p: Playlist, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    title: p.name,
    share_token: p.share_token,
    is_live: false,
    current_set_index: 0,
    current_slide_index: 0,
    created_at: new Date(p.createdAt).toISOString(),
    updated_at: new Date(p.updatedAt).toISOString(),
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
    share_token: row.share_token as string,
    setIds,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

// ---------------------------------------------------------------------------
// Push local → Supabase
// ---------------------------------------------------------------------------

export async function pushToSupabase(): Promise<void> {
  const session = getSession();
  if (!session) {
    console.log('[sync] pushToSupabase: skipped — no session');
    return;
  }
  const userId = session.user.id;
  const { setStatus } = useSyncStatusStore.getState();

  console.log('[sync] pushToSupabase: starting push for user', userId);
  setStatus('syncing');
  try {
    const [sets, gatherings] = await Promise.all([
      db.sets.toArray(),
      db.gatherings.toArray(),
    ]);

    console.log('[sync] pushToSupabase: pushing', sets.length, 'sets,', gatherings.length, 'gatherings');

    if (sets.length) {
      const { error } = await supabase
        .from('sets')
        .upsert(sets.map((s) => toSupabaseSet(s, userId)), { onConflict: 'id' });
      if (error) console.error('[sync] pushToSupabase: sets upsert error', error);
    }

    if (gatherings.length) {
      const { error: gErr } = await supabase
        .from('gatherings')
        .upsert(gatherings.map((p) => toSupabaseGathering(p, userId)), { onConflict: 'id' });
      if (gErr) console.error('[sync] pushToSupabase: gatherings upsert error', gErr);

      // Rebuild gathering_sets rows — id must be a valid UUID, derive one
      // deterministically from (gathering_id, position) so upserts are idempotent.
      const gatheringSetRows = await Promise.all(
        gatherings.flatMap((p) =>
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
          .in('gathering_id', gatherings.map((p) => p.id));
        if (delErr) console.error('[sync] pushToSupabase: gathering_sets delete error', delErr);

        const { error: insErr } = await supabase.from('gathering_sets').insert(gatheringSetRows);
        if (insErr) console.error('[sync] pushToSupabase: gathering_sets insert error', insErr);
      }
    }

    console.log('[sync] pushToSupabase: done');
    setStatus('synced');
  } catch (e) {
    console.error('[sync] pushToSupabase: unexpected error', e);
    setStatus('synced');
  }
}

// ---------------------------------------------------------------------------
// Check for remote changes
// ---------------------------------------------------------------------------

export async function checkForRemoteChanges(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  try {
    // Latest updated_at from Supabase
    const [remoteSetRes, remoteGatheringRes] = await Promise.all([
      supabase
        .from('sets')
        .select('updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('gatherings')
        .select('updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const remoteTs = Math.max(
      remoteSetRes.data ? new Date(remoteSetRes.data.updated_at as string).getTime() : 0,
      remoteGatheringRes.data ? new Date(remoteGatheringRes.data.updated_at as string).getTime() : 0,
    );
    if (remoteTs === 0) return false;

    // Latest updated_at from local Dexie
    const [localSet, localGathering] = await Promise.all([
      db.sets.orderBy('updatedAt').last(),
      db.gatherings.orderBy('updatedAt').last(),
    ]);

    const localTs = Math.max(
      localSet?.updatedAt ?? 0,
      localGathering?.updatedAt ?? 0,
    );

    return remoteTs > localTs;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pull Supabase → local (last-write-wins)
// ---------------------------------------------------------------------------

export async function pullFromSupabase(): Promise<void> {
  const session = getSession();
  if (!session) return;

  try {
    const [setsRes, gatheringsRes, gatheringSetsRes] = await Promise.all([
      supabase.from('sets').select('*').eq('user_id', session.user.id),
      supabase.from('gatherings').select('*').eq('user_id', session.user.id),
      supabase.from('gathering_sets').select('*'),
    ]);

    if (setsRes.data?.length) {
      const sets = (setsRes.data as Record<string, unknown>[]).map(fromSupabaseSet);
      await db.sets.bulkPut(sets);
    }

    if (gatheringsRes.data?.length) {
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

      const gatherings = (gatheringsRes.data as Record<string, unknown>[]).map((row) =>
        fromSupabaseGathering(row, (setIdsByGathering.get(row.id as string) ?? []).filter(Boolean))
      );
      await db.gatherings.bulkPut(gatherings);
    }
  } catch {
    // Silently swallow
  }
}
