import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Set as PhytoSet, Slide, LiveState, Gathering, SetTemplate } from "./types";
import { db } from "./db";
import { liveQuery } from "dexie";
import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import { pushToSupabase, withSyncLock } from "./sync";

function uid() {
  return crypto.randomUUID();
}

// --- Song template persistence + cross-window sync ---
const TEMPLATE_KEY = "song-template-v1";

function readSongTemplate(): SetTemplate {
  if (typeof window === "undefined")
    return { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black" };
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black" };
}

// --- Scripture template persistence + cross-window sync ---
const SCRIPTURE_TEMPLATE_KEY = "scripture-template-v1";

// --- Global fade duration persistence + cross-window sync ---
const FADE_KEY = "fade-ms-v1";

function readFadeMs(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(FADE_KEY);
    if (raw) return Number(raw);
  } catch {}
  return 0;
}

function readScriptureTemplate(): SetTemplate {
  if (typeof window === "undefined")
    return { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black", align: "left", referencePosition: "below" };
  try {
    const raw = localStorage.getItem(SCRIPTURE_TEMPLATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black", align: "left", referencePosition: "below" };
}

// Debounce pushToSupabase so rapid consecutive mutations fire only one push,
// and accumulate WHICH rows changed so the push uploads only those — work that
// scales with the number of edits, not the size of the library. Cross-tab store
// consistency is handled reactively by the Dexie `liveQuery` subscription at the
// bottom of this file (every tab re-derives its store from Dexie on any write),
// so no bespoke broadcast plumbing is needed here.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const dirtySetIds = new Set<string>();
const dirtyGatheringIds = new Set<string>();
function schedulePush(opts?: { set?: string; gathering?: string }) {
  if (opts?.set) dirtySetIds.add(opts.set);
  if (opts?.gathering) dirtyGatheringIds.add(opts.gathering);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const setIds = [...dirtySetIds];
    const gatheringIds = [...dirtyGatheringIds];
    dirtySetIds.clear();
    dirtyGatheringIds.clear();
    console.log('[sync] schedulePush: debounce elapsed, pushing', setIds.length, 'sets,', gatheringIds.length, 'gatherings at', new Date().toISOString());
    pushToSupabase({ setIds, gatheringIds }).then((ok) => {
      if (ok) return;
      // Push failed (e.g. offline). Re-mark the rows dirty and reschedule so the
      // change isn't lost; the load-time diff is the cross-session safety net.
      setIds.forEach((id) => dirtySetIds.add(id));
      gatheringIds.forEach((id) => dirtyGatheringIds.add(id));
      schedulePush();
    });
  }, 500);
}

// Best-effort cleanup of R2-hosted uploads when their slides go away. Only
// `videoSource === "file"` slides own an R2 object (youtube/url slides just
// reference external URLs). Fired and forgotten: a failed delete leaves an
// orphan but never blocks or breaks the local edit. The server re-validates
// that the object belongs to the caller before deleting.
function purgeUploadedVideos(slides: Slide[]): void {
  const urls = slides
    .filter((sl) => sl.kind === "video" && sl.videoSource === "file" && sl.videoUrl)
    .map((sl) => sl.videoUrl as string);
  if (urls.length === 0) return;
  const token = useAuthStore.getState().session?.access_token;
  if (!token) return;
  for (const url of urls) {
    fetch("/api/media/upload", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => {
      // Orphaned object; the quota check is the backstop. Nothing to do.
    });
  }
}

/**
 * Pure derivation of the library store shape from raw Dexie rows. Shared by
 * `loadFromDb` and the cross-tab `liveQuery` subscription so both produce an
 * identical store, sorted newest-first by `createdAt`.
 */
function buildLibraryState(allSets: PhytoSet[], allGatherings: Gathering[]) {
  const sets: Record<string, PhytoSet> = {};
  const order: string[] = [];
  for (const s of allSets) {
    sets[s.id] = s;
    order.push(s.id);
  }
  order.sort((a, b) => (sets[b].createdAt ?? 0) - (sets[a].createdAt ?? 0));

  const gatherings: Record<string, Gathering> = {};
  const gatheringOrder: string[] = [];
  for (const p of allGatherings) {
    gatherings[p.id] = p;
    gatheringOrder.push(p.id);
  }
  gatheringOrder.sort((a, b) => (gatherings[b].createdAt ?? 0) - (gatherings[a].createdAt ?? 0));

  return { sets, order, gatherings, gatheringOrder };
}

interface LibraryState {
  sets: Record<string, PhytoSet>;
  order: string[];
  gatherings: Record<string, Gathering>;
  gatheringOrder: string[];
  /** Global template applied to ALL song sets. */
  songTemplate: SetTemplate;
  setSongTemplate: (patch: SetTemplate) => void;
  /** Global template applied to ALL scripture sets. */
  scriptureTemplate: SetTemplate;
  setScriptureTemplate: (patch: SetTemplate) => void;
  /** Global slide crossfade duration in milliseconds (applies to all set types). */
  fadeMs: number;
  setFadeMs: (ms: number) => void;
  createSet: (set: Omit<PhytoSet, "id" | "createdAt" | "updatedAt">) => string;
  updateSet: (id: string, patch: Partial<PhytoSet>) => void;
  deleteSet: (id: string) => void;
  addSlide: (setId: string, slide: Omit<Slide, "id">) => string;
  updateSlide: (setId: string, slideId: string, patch: Partial<Slide>) => void;
  removeSlide: (setId: string, slideId: string) => void;
  reorderSlides: (setId: string, ids: string[]) => void;
  createGathering: (name: string) => string;
  renameGathering: (id: string, name: string) => void;
  deleteGathering: (id: string) => void;
  addSetToGathering: (gatheringId: string, setId: string) => void;
  removeSetFromGathering: (gatheringId: string, setIdOrIndex: string | number) => void;
  reorderGatheringSets: (gatheringId: string, setIds: string[]) => void;
  /** Set this gathering live (and take all others offline). Supabase is the
   *  source of truth; Dexie/Zustand are updated to reflect it. */
  goLive: (gatheringId: string) => Promise<void>;
  /** End the live session for this gathering. Supabase is the source of truth. */
  endSession: (gatheringId: string) => Promise<void>;
  /** Hydrate local `is_live` from Supabase (the source of truth). Call on
   *  login / session restore. No-op when signed out. */
  refreshLiveState: () => Promise<void>;
  /** Null out local `is_live` for all gatherings. Call on logout — no local
   *  truth is held while signed out. */
  nullLocalLiveState: () => Promise<void>;
  /** Populate store from Dexie — call once on app mount. */
  loadFromDb: () => Promise<void>;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  sets: {},
  order: [],
  gatherings: {},
  gatheringOrder: [],
  songTemplate: typeof window !== "undefined" ? readSongTemplate() : { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black" },
  scriptureTemplate: typeof window !== "undefined" ? readScriptureTemplate() : { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black", align: "left", referencePosition: "below" },
  fadeMs: typeof window !== "undefined" ? readFadeMs() : 0,

  loadFromDb: async () => {
    const [allSets, allGatherings] = await Promise.all([
      db.sets.toArray(),
      db.gatherings.toArray(),
    ]);
    set(buildLibraryState(allSets, allGatherings));
  },

  setSongTemplate: (patch) =>
    set((s) => {
      const next = { ...s.songTemplate, ...patch };
      try {
        localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
        new BroadcastChannel(TEMPLATE_KEY).postMessage(next);
      } catch {}
      return { songTemplate: next };
    }),

  setScriptureTemplate: (patch) =>
    set((s) => {
      const next = { ...s.scriptureTemplate, ...patch };
      try {
        localStorage.setItem(SCRIPTURE_TEMPLATE_KEY, JSON.stringify(next));
        new BroadcastChannel(SCRIPTURE_TEMPLATE_KEY).postMessage(next);
      } catch {}
      return { scriptureTemplate: next };
    }),

  setFadeMs: (ms) =>
    set(() => {
      try {
        localStorage.setItem(FADE_KEY, String(ms));
        new BroadcastChannel(FADE_KEY).postMessage(ms);
      } catch {}
      return { fadeMs: ms };
    }),

  createSet: (newSet) => {
    const id = uid();
    const now = Date.now();
    const record: PhytoSet = { ...newSet, id, createdAt: now, updatedAt: now };
    set((s) => ({
      sets: { ...s.sets, [id]: record },
      order: [id, ...s.order],
    }));
    db.sets.put(record).then(() => schedulePush({ set: id }));
    return id;
  },

  updateSet: (id, patch) =>
    set((s) => {
      const d = s.sets[id];
      if (!d) return s;
      const updated = { ...d, ...patch, updatedAt: Date.now() };
      db.sets.put(updated).then(() => schedulePush({ set: id }));
      // Keep live slideId at same position index when slides are regenerated.
      if (patch.slides) {
        const live = useLive.getState();
        if (live.setId === id && !patch.slides.find((sl) => sl.id === live.slideId)) {
          const oldIdx = d.slides.findIndex((sl) => sl.id === live.slideId);
          const newSlide = patch.slides[Math.min(Math.max(oldIdx, 0), patch.slides.length - 1)];
          if (newSlide) useLive.getState().setLive({ slideId: newSlide.id });
        }
      }
      return { sets: { ...s.sets, [id]: updated } };
    }),

  deleteSet: async (id) => {
    // Serialize against pushes/merges under the shared sync lock so an in-flight
    // push (holding a pre-delete Dexie snapshot) can't re-upsert this row.
    await withSyncLock(async () => {
      const removedSlides = get().sets[id]?.slides ?? [];
      const session = useAuthStore.getState().session;
      if (session) {
        const { error } = await supabase
          .from('sets')
          .delete()
          .eq('id', id)
          .eq('user_id', session.user.id);
        if (error) console.error('[deleteSet] Supabase delete error:', error);
      }
      await db.sets.delete(id);
      purgeUploadedVideos(removedSlides);
      set((s) => {
        const { [id]: _gone, ...rest } = s.sets;
        return { sets: rest, order: s.order.filter((x) => x !== id) };
      });
      // Remove deleted set from all gatherings to avoid FK violations on next push
      const gatherings = get().gatherings;
      const toUpdate: Gathering[] = [];
      for (const p of Object.values(gatherings)) {
        if (p.setIds.includes(id)) {
          toUpdate.push({ ...p, setIds: p.setIds.filter((s) => s !== id), updatedAt: Date.now() });
        }
      }
      if (toUpdate.length) {
        await Promise.all(toUpdate.map((p) => db.gatherings.put(p)));
        set((s) => ({
          gatherings: { ...s.gatherings, ...Object.fromEntries(toUpdate.map((p) => [p.id, p])) },
        }));
        for (const p of toUpdate) schedulePush({ gathering: p.id });
      }
    });
  },

  addSlide: (setId, slide) => {
    const id = uid();
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const updated = { ...d, slides: [...d.slides, { ...slide, id }], updatedAt: Date.now() };
      db.sets.put(updated).then(() => schedulePush({ set: setId }));
      return { sets: { ...s.sets, [setId]: updated } };
    });
    return id;
  },

  updateSlide: (setId, slideId, patch) =>
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const updated = {
        ...d,
        slides: d.slides.map((sl) => (sl.id === slideId ? { ...sl, ...patch } : sl)),
        updatedAt: Date.now(),
      };
      db.sets.put(updated).then(() => schedulePush({ set: setId }));
      return { sets: { ...s.sets, [setId]: updated } };
    }),

  removeSlide: (setId, slideId) =>
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const removed = d.slides.find((sl) => sl.id === slideId);
      const updated = {
        ...d,
        slides: d.slides.filter((sl) => sl.id !== slideId),
        updatedAt: Date.now(),
      };
      db.sets.put(updated).then(() => schedulePush({ set: setId }));
      if (removed) purgeUploadedVideos([removed]);
      return { sets: { ...s.sets, [setId]: updated } };
    }),

  reorderSlides: (setId, ids) =>
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const map = new Map(d.slides.map((sl) => [sl.id, sl]));
      const slides = ids.map((i) => map.get(i)!).filter(Boolean);
      const updated = { ...d, slides, updatedAt: Date.now() };
      db.sets.put(updated).then(() => schedulePush({ set: setId }));
      return { sets: { ...s.sets, [setId]: updated } };
    }),

  createGathering: (name) => {
    const id = uid();
    const now = Date.now();
    const record: Gathering = {
      id,
      name,
      setIds: [],
      share_token: nanoid(10),
      is_live: false,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      gatherings: { ...s.gatherings, [id]: record },
      gatheringOrder: [id, ...s.gatheringOrder],
    }));
    db.gatherings.put(record).then(() => schedulePush({ gathering: id }));
    return id;
  },

  renameGathering: (id, name) =>
    set((s) => {
      const p = s.gatherings[id];
      if (!p) return s;
      const updated = { ...p, name, updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush({ gathering: id }));
      return { gatherings: { ...s.gatherings, [id]: updated } };
    }),

  deleteGathering: async (id) => {
    // Serialize against pushes/merges so an in-flight push can't re-upsert this
    // gathering (or its gathering_sets) from a pre-delete Dexie snapshot.
    await withSyncLock(async () => {
      const session = useAuthStore.getState().session;
      if (session) {
        const userId = session.user.id;
        const { error: gsErr } = await supabase
          .from('gathering_sets')
          .delete()
          .eq('gathering_id', id);
        if (gsErr) console.error('[deleteGathering] gathering_sets delete error:', gsErr);

        const { error: gErr } = await supabase
          .from('gatherings')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
        if (gErr) console.error('[deleteGathering] gatherings delete error:', gErr);
      }

      await db.gatherings.delete(id);

      set((s) => {
        const { [id]: _gone, ...rest } = s.gatherings;
        return { gatherings: rest, gatheringOrder: s.gatheringOrder.filter((x) => x !== id) };
      });
    });
  },

  addSetToGathering: (gatheringId, setId) =>
    set((s) => {
      const p = s.gatherings[gatheringId];
      if (!p) return s;
      const updated = { ...p, setIds: [...p.setIds, setId], updatedAt: Date.now() };
      console.log('[addSetToGathering] gathering', gatheringId, '| added set', setId, '| setIds now:', updated.setIds, '| is_live:', updated.is_live, '| scheduling push in 500ms');
      db.gatherings.put(updated).then(() => {
        console.log('[addSetToGathering] Dexie write done, firing schedulePush');
        schedulePush({ gathering: gatheringId });
      });
      return { gatherings: { ...s.gatherings, [gatheringId]: updated } };
    }),

  removeSetFromGathering: (gatheringId, setIdOrIndex) =>
    set((s) => {
      const p = s.gatherings[gatheringId];
      if (!p) return s;
      let setIds: string[];
      if (typeof setIdOrIndex === "number") {
        setIds = p.setIds.filter((_, i) => i !== setIdOrIndex);
      } else {
        const idx = p.setIds.indexOf(setIdOrIndex);
        if (idx === -1) return s;
        setIds = p.setIds.filter((_, i) => i !== idx);
      }
      const updated = { ...p, setIds, updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush({ gathering: gatheringId }));
      return { gatherings: { ...s.gatherings, [gatheringId]: updated } };
    }),

  reorderGatheringSets: (gatheringId, setIds) =>
    set((s) => {
      const p = s.gatherings[gatheringId];
      if (!p) return s;
      const updated = { ...p, setIds, updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush({ gathering: gatheringId }));
      return { gatherings: { ...s.gatherings, [gatheringId]: updated } };
    }),

  goLive: async (gatheringId) => {
    const { gatherings } = get();
    const target = gatherings[gatheringId];
    if (!target) {
      console.error('[goLive] aborted — gathering not found in store:', gatheringId);
      return;
    }
    const session = useAuthStore.getState().session;
    if (!session) {
      console.error('[goLive] aborted — no session');
      return;
    }
    const userId = session.user.id;

    // ── Supabase (source of truth) ────────────────────────────────────────────
    // 1. Take every other gathering offline first, so there is never a window
    //    with two live rows.
    const { error: offlineErr } = await supabase
      .from('gatherings')
      .update({ is_live: false })
      .neq('id', gatheringId)
      .eq('user_id', userId);
    if (offlineErr) {
      console.error('[goLive] offline-others error:', offlineErr);
      throw offlineErr;
    }

    // 2. Upsert the target with is_live: true in a single call — this both
    //    ensures a never-pushed gathering exists and flips it live atomically.
    const { error: liveErr } = await supabase
      .from('gatherings')
      .upsert({
        id: target.id,
        user_id: userId,
        title: target.name,
        share_token: target.share_token,
        is_live: true,
        current_set_index: 0,
        current_slide_index: 0,
        created_at: new Date(target.createdAt).toISOString(),
        updated_at: new Date(target.updatedAt).toISOString(),
      }, { onConflict: 'id' });
    if (liveErr) {
      console.error('[goLive] live upsert error:', liveErr);
      throw liveErr;
    }

    // ── Reflect into Dexie + Zustand (do NOT bump updatedAt — is_live is not a
    //    synced content change, and bumping it would trigger a false conflict).
    const allGatherings = await db.gatherings.toArray();
    await db.transaction('rw', db.gatherings, async () => {
      for (const p of allGatherings) {
        if (p.id === gatheringId && p.is_live !== true) {
          await db.gatherings.put({ ...p, is_live: true });
        } else if (p.id !== gatheringId && p.is_live) {
          await db.gatherings.put({ ...p, is_live: false });
        }
      }
    });
    set((s) => {
      const updated = { ...s.gatherings };
      for (const id of Object.keys(updated)) {
        updated[id] = { ...updated[id], is_live: id === gatheringId };
      }
      return { gatherings: updated };
    });
  },

  endSession: async (gatheringId) => {
    const { gatherings } = get();
    const target = gatherings[gatheringId];
    if (!target) return;
    const session = useAuthStore.getState().session;
    if (!session) {
      console.error('[endSession] aborted — no session');
      return;
    }

    // ── Supabase (source of truth) ────────────────────────────────────────────
    const { error } = await supabase
      .from('gatherings')
      .update({ is_live: false })
      .eq('id', gatheringId)
      .eq('user_id', session.user.id);
    if (error) {
      console.error('[endSession] error:', error);
      throw error;
    }

    // ── Reflect locally without bumping updatedAt ─────────────────────────────
    const updated = { ...target, is_live: false };
    set((s) => ({ gatherings: { ...s.gatherings, [gatheringId]: updated } }));
    await db.gatherings.put(updated);
  },

  refreshLiveState: async () => {
    const session = useAuthStore.getState().session;
    if (!session) return;
    const { data, error } = await supabase
      .from('gatherings')
      .select('id, is_live')
      .eq('user_id', session.user.id);
    if (error) {
      console.error('[refreshLiveState] error:', error);
      return;
    }
    const liveById = new Map(
      (data ?? []).map((r) => [r.id as string, (r.is_live as boolean) ?? false]),
    );

    // Update only gatherings that exist on the server; leave local-only ones.
    const localGatherings = await db.gatherings.toArray();
    await db.transaction('rw', db.gatherings, async () => {
      for (const p of localGatherings) {
        if (liveById.has(p.id)) {
          const isLive = liveById.get(p.id)!;
          if (p.is_live !== isLive) await db.gatherings.put({ ...p, is_live: isLive });
        }
      }
    });
    set((s) => {
      const updated = { ...s.gatherings };
      for (const id of Object.keys(updated)) {
        if (liveById.has(id)) updated[id] = { ...updated[id], is_live: liveById.get(id)! };
      }
      return { gatherings: updated };
    });
  },

  nullLocalLiveState: async () => {
    const localGatherings = await db.gatherings.toArray();
    await db.gatherings.bulkPut(localGatherings.map((p) => ({ ...p, is_live: null })));
    set((s) => {
      const updated = { ...s.gatherings };
      for (const id of Object.keys(updated)) {
        updated[id] = { ...updated[id], is_live: null };
      }
      return { gatherings: updated };
    });
  },
}));

// Reactively mirror the in-memory store to Dexie. Dexie's `liveQuery` is
// cross-tab: any write in ANY tab/window (a local mutation, a sync merge, a push
// timestamp writeback, an import) re-emits here and re-derives the whole store.
// This is the load-bearing fix for multi-tab duplication — the store can never
// hold a stale id that was re-keyed/deleted in another tab, so mutations can't
// resurrect a deleted Dexie row. It also replaces the old `sync-complete` /
// `set-sync-v1` BroadcastChannels and the post-sync `loadFromDb()` calls.
if (typeof window !== "undefined") {
  liveQuery(() => Promise.all([db.sets.toArray(), db.gatherings.toArray()])).subscribe({
    next: ([allSets, allGatherings]) =>
      useLibrary.setState(buildLibraryState(allSets, allGatherings)),
    error: (err) => console.error("[store] liveQuery subscription error:", err),
  });
}

// Ephemeral, non-persisted preview of the song template while the editor is
// open. When non-null, slide views should render with this draft instead of
// the saved `songTemplate` so the user can see changes live.
interface SongTemplateDraftStore {
  draft: SetTemplate | null;
  setDraft: (d: SetTemplate | null) => void;
}
export const useSongTemplateDraft = create<SongTemplateDraftStore>((set) => ({
  draft: null,
  setDraft: (d) => set({ draft: d }),
}));

// Ephemeral draft for scripture template preview.
interface ScriptureTemplateDraftStore {
  draft: SetTemplate | null;
  setDraft: (d: SetTemplate | null) => void;
}
export const useScriptureTemplateDraft = create<ScriptureTemplateDraftStore>((set) => ({
  draft: null,
  setDraft: (d) => set({ draft: d }),
}));

// --- Live presentation state, synced across windows via BroadcastChannel ---

const CHANNEL = "stage-live-v2";
const STORAGE_KEY = "stage-live-v2";

export interface LiveStore extends LiveState {
  setLive: (patch: Partial<LiveState>) => void;
  go: (setId: string, slideId: string) => void;
  clearLive: () => void;
  toggleBlackout: () => void;
  toggleClear: () => void;
  /** Start/stop playback of the current video slide (broadcast to /output). */
  setVideoPlaying: (play: boolean) => void;
  /** Restart the current video from the beginning and play. */
  restartVideo: () => void;
  /** Marked by the output window when the current video finishes. */
  videoFinished: () => void;
}

const DEFAULT_VIDEO_CMD = { action: "pause" as const, nonce: 0 };

/** True when the live video slide is (intended to be) playing. */
export function isVideoPlaying(live: Pick<LiveState, "videoCmd" | "videoEnded">): boolean {
  const a = live.videoCmd?.action;
  return !live.videoEnded && (a === "play" || a === "restart");
}

function defaultLive(): LiveState {
  return {
    setId: null,
    slideId: null,
    blackout: false,
    clear: false,
    blackoutFadeMs: 0,
    videoCmd: DEFAULT_VIDEO_CMD,
    videoEnded: false,
  };
}

// Computes the videoCmd for a freshly-shown slide: autoplay video slides start
// playing, everything else resets to paused so a prior video stops.
function videoCmdForSlide(
  setId: string,
  slideId: string,
  prevNonce: number,
): LiveState["videoCmd"] {
  const slide = useLibrary
    .getState()
    .sets[setId]?.slides.find((s) => s.id === slideId);
  const action = slide?.kind === "video" && slide.autoplay ? "play" : "pause";
  return { action, nonce: prevNonce + 1 };
}

function readInitial(): LiveState {
  if (typeof window === "undefined") return defaultLive();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultLive(), ...JSON.parse(raw) };
  } catch {}
  return defaultLive();
}

let bc: BroadcastChannel | null = null;
function getChannel() {
  if (typeof window === "undefined") return null;
  if (!bc) bc = new BroadcastChannel(CHANNEL);
  return bc;
}

export const useLive = create<LiveStore>((set, get) => ({
  ...readInitial(),
  setLive: (patch) => {
    set(patch);
    const s = get();
    const snapshot: LiveState = {
      setId: s.setId,
      slideId: s.slideId,
      blackout: s.blackout,
      clear: s.clear,
      blackoutFadeMs: s.blackoutFadeMs,
      videoCmd: s.videoCmd,
      videoEnded: s.videoEnded,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      try { getChannel()?.postMessage(snapshot); } catch {}
    }
  },
  go: (setId, slideId) => {
    const videoCmd = videoCmdForSlide(setId, slideId, get().videoCmd?.nonce ?? 0);
    if (get().blackout) {
      // Swap the slide silently under the blackout, then reveal with a fade.
      get().setLive({ setId, slideId, clear: false, videoCmd, videoEnded: false });
      if (typeof window !== "undefined") {
        setTimeout(() => get().setLive({ blackout: false, blackoutFadeMs: 500 }), 80);
      }
    } else {
      get().setLive({ setId, slideId, blackout: false, clear: false, blackoutFadeMs: 0, videoCmd, videoEnded: false });
    }
  },
  clearLive: () => {
    // Dissolve to black over 0.5s, then fully clear.
    get().setLive({ blackout: true, blackoutFadeMs: 500 });
    if (typeof window !== "undefined") {
      setTimeout(() => {
        get().setLive({ setId: null, slideId: null, blackout: false, clear: false, blackoutFadeMs: 0 });
      }, 520);
    }
  },
  toggleBlackout: () => get().setLive({ blackout: !get().blackout, blackoutFadeMs: 500 }),
  toggleClear: () => get().setLive({ clear: !get().clear }),
  setVideoPlaying: (play) =>
    get().setLive({
      videoCmd: { action: play ? "play" : "pause", nonce: (get().videoCmd?.nonce ?? 0) + 1 },
      videoEnded: false,
    }),
  restartVideo: () =>
    get().setLive({
      videoCmd: { action: "restart", nonce: (get().videoCmd?.nonce ?? 0) + 1 },
      videoEnded: false,
    }),
  videoFinished: () =>
    get().setLive({
      videoCmd: { action: "pause", nonce: (get().videoCmd?.nonce ?? 0) + 1 },
      videoEnded: true,
    }),
}));

// Subscribe to broadcast updates
if (typeof window !== "undefined") {
  const ch = getChannel();
  ch?.addEventListener("message", (e) => {
    const data = e.data as LiveState;
    useLive.setState(data);
  });
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        useLive.setState(JSON.parse(e.newValue));
      } catch {}
    }
    if (e.key === TEMPLATE_KEY && e.newValue) {
      try {
        useLibrary.setState({ songTemplate: JSON.parse(e.newValue) });
      } catch {}
    }
    if (e.key === SCRIPTURE_TEMPLATE_KEY && e.newValue) {
      try {
        useLibrary.setState({ scriptureTemplate: JSON.parse(e.newValue) });
      } catch {}
    }
  });

  const tc = new BroadcastChannel(TEMPLATE_KEY);
  tc.addEventListener("message", (e) => {
    useLibrary.setState({ songTemplate: e.data });
  });

  const stc = new BroadcastChannel(SCRIPTURE_TEMPLATE_KEY);
  stc.addEventListener("message", (e) => {
    useLibrary.setState({ scriptureTemplate: e.data });
  });

  const ftc = new BroadcastChannel(FADE_KEY);
  ftc.addEventListener("message", (e) => {
    useLibrary.setState({ fadeMs: e.data });
  });
}
