import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Set as PhytoSet, Slide, LiveState, Playlist, SetTemplate } from "./types";
import { db } from "./db";
import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import { pushToSupabase, shouldSkipPush } from "./sync";

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

function readScriptureTemplate(): SetTemplate {
  if (typeof window === "undefined")
    return { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black", align: "left", referencePosition: "below" };
  try {
    const raw = localStorage.getItem(SCRIPTURE_TEMPLATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black", align: "left", referencePosition: "below" };
}

// Debounce pushToSupabase so rapid consecutive mutations fire only one push.
// If another tab just completed a push and broadcast sync-complete, skip this
// tab's push — the data is already in Supabase and loadFromDb has been called.
const SET_SYNC_CHANNEL = "set-sync-v1";

let setSyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSyncBroadcast(updated: PhytoSet) {
  if (setSyncTimer) clearTimeout(setSyncTimer);
  setSyncTimer = setTimeout(() => {
    setSyncTimer = null;
    try { new BroadcastChannel(SET_SYNC_CHANNEL).postMessage(updated); } catch {}
  }, 250);
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (shouldSkipPush()) {
      console.log('[sync] schedulePush: skipped — another tab synced recently');
      return;
    }
    console.log('[sync] schedulePush: debounce elapsed, calling pushToSupabase at', new Date().toISOString());
    pushToSupabase();
  }, 500);
}

interface LibraryState {
  sets: Record<string, PhytoSet>;
  order: string[];
  playlists: Record<string, Playlist>;
  playlistOrder: string[];
  /** Global template applied to ALL song sets. */
  songTemplate: SetTemplate;
  setSongTemplate: (patch: SetTemplate) => void;
  /** Global template applied to ALL scripture sets. */
  scriptureTemplate: SetTemplate;
  setScriptureTemplate: (patch: SetTemplate) => void;
  createSet: (set: Omit<PhytoSet, "id" | "createdAt" | "updatedAt">) => string;
  updateSet: (id: string, patch: Partial<PhytoSet>) => void;
  deleteSet: (id: string) => void;
  addSlide: (setId: string, slide: Omit<Slide, "id">) => string;
  updateSlide: (setId: string, slideId: string, patch: Partial<Slide>) => void;
  removeSlide: (setId: string, slideId: string) => void;
  reorderSlides: (setId: string, ids: string[]) => void;
  createPlaylist: (name: string) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addSetToPlaylist: (playlistId: string, setId: string) => void;
  removeSetFromPlaylist: (playlistId: string, setIdOrIndex: string | number) => void;
  reorderPlaylistSets: (playlistId: string, setIds: string[]) => void;
  /** Set this gathering live (and take all others offline) in Dexie + Supabase. */
  goLive: (gatheringId: string) => Promise<void>;
  /** End the live session for this gathering in Dexie + Supabase. */
  endSession: (gatheringId: string) => Promise<void>;
  /** Populate store from Dexie — call once on app mount. */
  loadFromDb: () => Promise<void>;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  sets: {},
  order: [],
  playlists: {},
  playlistOrder: [],
  songTemplate: typeof window !== "undefined" ? readSongTemplate() : { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black" },
  scriptureTemplate: typeof window !== "undefined" ? readScriptureTemplate() : { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black", align: "left", referencePosition: "below" },

  loadFromDb: async () => {
    const [allSets, allGatherings] = await Promise.all([
      db.sets.toArray(),
      db.gatherings.toArray(),
    ]);
    console.log('[loadFromDb] sets from Dexie:', allSets.length, '| gatherings from Dexie:', allGatherings.length);
    console.log('[loadFromDb] gatherings:', allGatherings.map((p) => ({ id: p.id, name: p.name, share_token: p.share_token, is_live: p.is_live })));

    const sets: Record<string, PhytoSet> = {};
    const order: string[] = [];
    for (const s of allSets) {
      sets[s.id] = s;
      order.push(s.id);
    }
    order.sort((a, b) => (sets[b].createdAt ?? 0) - (sets[a].createdAt ?? 0));

    const playlists: Record<string, Playlist> = {};
    const playlistOrder: string[] = [];
    for (const p of allGatherings) {
      playlists[p.id] = p;
      playlistOrder.push(p.id);
    }
    playlistOrder.sort((a, b) => (playlists[b].createdAt ?? 0) - (playlists[a].createdAt ?? 0));

    set({ sets, order, playlists, playlistOrder });
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

  createSet: (newSet) => {
    const id = uid();
    const now = Date.now();
    const record: PhytoSet = { ...newSet, id, createdAt: now, updatedAt: now };
    set((s) => ({
      sets: { ...s.sets, [id]: record },
      order: [id, ...s.order],
    }));
    db.sets.add(record).then(() => schedulePush());
    return id;
  },

  updateSet: (id, patch) =>
    set((s) => {
      const d = s.sets[id];
      if (!d) return s;
      const updated = { ...d, ...patch, updatedAt: Date.now() };
      db.sets.put(updated).then(() => schedulePush());
      // Broadcast updated set so other windows (output) stay in sync (debounced).
      scheduleSyncBroadcast(updated);
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
    set((s) => {
      const { [id]: _gone, ...rest } = s.sets;
      return { sets: rest, order: s.order.filter((x) => x !== id) };
    });
    // Remove deleted set from all gatherings to avoid FK violations on next push
    const playlists = get().playlists;
    const toUpdate: Playlist[] = [];
    for (const p of Object.values(playlists)) {
      if (p.setIds.includes(id)) {
        toUpdate.push({ ...p, setIds: p.setIds.filter((s) => s !== id), updatedAt: Date.now() });
      }
    }
    if (toUpdate.length) {
      await Promise.all(toUpdate.map((p) => db.gatherings.put(p)));
      set((s) => ({
        playlists: { ...s.playlists, ...Object.fromEntries(toUpdate.map((p) => [p.id, p])) },
      }));
      schedulePush();
    }
  },

  addSlide: (setId, slide) => {
    const id = uid();
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const updated = { ...d, slides: [...d.slides, { ...slide, id }], updatedAt: Date.now() };
      db.sets.put(updated).then(() => schedulePush());
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
      db.sets.put(updated).then(() => schedulePush());
      return { sets: { ...s.sets, [setId]: updated } };
    }),

  removeSlide: (setId, slideId) =>
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const updated = {
        ...d,
        slides: d.slides.filter((sl) => sl.id !== slideId),
        updatedAt: Date.now(),
      };
      db.sets.put(updated).then(() => schedulePush());
      return { sets: { ...s.sets, [setId]: updated } };
    }),

  reorderSlides: (setId, ids) =>
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const map = new Map(d.slides.map((sl) => [sl.id, sl]));
      const slides = ids.map((i) => map.get(i)!).filter(Boolean);
      const updated = { ...d, slides, updatedAt: Date.now() };
      db.sets.put(updated).then(() => schedulePush());
      return { sets: { ...s.sets, [setId]: updated } };
    }),

  createPlaylist: (name) => {
    const id = uid();
    const now = Date.now();
    const record: Playlist = {
      id,
      name,
      setIds: [],
      share_token: nanoid(10),
      is_live: false,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      playlists: { ...s.playlists, [id]: record },
      playlistOrder: [id, ...s.playlistOrder],
    }));
    db.gatherings.add(record).then(() => schedulePush());
    return id;
  },

  renamePlaylist: (id, name) =>
    set((s) => {
      const p = s.playlists[id];
      if (!p) return s;
      const updated = { ...p, name, updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush());
      return { playlists: { ...s.playlists, [id]: updated } };
    }),

  deletePlaylist: async (id) => {
    const session = useAuthStore.getState().session;
    if (session) {
      const userId = session.user.id;
      const { error: gsErr } = await supabase
        .from('gathering_sets')
        .delete()
        .eq('gathering_id', id);
      if (gsErr) console.error('[deletePlaylist] gathering_sets delete error:', gsErr);

      const { error: gErr } = await supabase
        .from('gatherings')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (gErr) console.error('[deletePlaylist] gatherings delete error:', gErr);
    }

    await db.gatherings.delete(id);

    set((s) => {
      const { [id]: _gone, ...rest } = s.playlists;
      return { playlists: rest, playlistOrder: s.playlistOrder.filter((x) => x !== id) };
    });
  },

  addSetToPlaylist: (playlistId, setId) =>
    set((s) => {
      const p = s.playlists[playlistId];
      if (!p) return s;
      const updated = { ...p, setIds: [...p.setIds, setId], updatedAt: Date.now() };
      console.log('[addSetToPlaylist] gathering', playlistId, '| added set', setId, '| setIds now:', updated.setIds, '| is_live:', updated.is_live, '| scheduling push in 500ms');
      db.gatherings.put(updated).then(() => {
        console.log('[addSetToPlaylist] Dexie write done, firing schedulePush');
        schedulePush();
      });
      return { playlists: { ...s.playlists, [playlistId]: updated } };
    }),

  removeSetFromPlaylist: (playlistId, setIdOrIndex) =>
    set((s) => {
      const p = s.playlists[playlistId];
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
      db.gatherings.put(updated).then(() => schedulePush());
      return { playlists: { ...s.playlists, [playlistId]: updated } };
    }),

  reorderPlaylistSets: (playlistId, setIds) =>
    set((s) => {
      const p = s.playlists[playlistId];
      if (!p) return s;
      const updated = { ...p, setIds, updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush());
      return { playlists: { ...s.playlists, [playlistId]: updated } };
    }),

  goLive: async (gatheringId) => {
    const { playlists } = get();
    const target = playlists[gatheringId];
    console.log('[goLive] target gathering:', target);
    if (!target) {
      console.error('[goLive] aborted — gathering not found in store:', gatheringId);
      return;
    }
    const now = Date.now();

    // ── Step 1: Supabase ──────────────────────────────────────────────────────
    // Ensure the gathering row exists in Supabase before updating is_live.
    // A gathering created locally may never have been pushed, so upsert it first.
    const session = useAuthStore.getState().session;
    if (!session) {
      console.error('[goLive] aborted — no session');
      return;
    }
    const userId = session.user.id;

    console.log('[goLive] started at', new Date().toISOString(), '| target is_live in store:', target.is_live, '| setIds:', target.setIds);
    console.log('[goLive] upserting gathering to Supabase before going live...');
    const { error: upsertErr } = await supabase
      .from('gatherings')
      .upsert({
        id: target.id,
        user_id: userId,
        title: target.name,
        share_token: target.share_token,
        is_live: false,
        current_set_index: 0,
        current_slide_index: 0,
        created_at: new Date(target.createdAt).toISOString(),
        updated_at: new Date(target.updatedAt).toISOString(),
      }, { onConflict: 'id' });
    if (upsertErr) console.error('[goLive] upsert error:', upsertErr);

    console.log('[goLive] setting all other gatherings offline...');
    const { error: offlineErr } = await supabase
      .from('gatherings')
      .update({ is_live: false })
      .neq('id', gatheringId);
    if (offlineErr) console.error('[goLive] offline-others error:', offlineErr);

    console.log('[goLive] setting target gathering live...');
    const { data: liveData, error: liveErr } = await supabase
      .from('gatherings')
      .update({ is_live: true })
      .eq('id', gatheringId)
      .select();
    console.log('[goLive] live update response — data:', liveData, 'error:', liveErr);
    if (liveErr) console.error('[goLive] live update error:', liveErr);

    // ── Step 2: Dexie ─────────────────────────────────────────────────────────
    console.log('[goLive] updating Dexie...');
    const allGatherings = await db.gatherings.toArray();
    await db.transaction('rw', db.gatherings, async () => {
      for (const p of allGatherings) {
        if (p.id === gatheringId) {
          await db.gatherings.put({ ...p, is_live: true, updatedAt: now });
        } else if (p.is_live) {
          await db.gatherings.put({ ...p, is_live: false, updatedAt: now });
        }
      }
    });
    console.log('[goLive] Dexie updated');

    // ── Step 3: Zustand ───────────────────────────────────────────────────────
    set((s) => {
      const updated = { ...s.playlists };
      for (const id of Object.keys(updated)) {
        updated[id] = { ...updated[id], is_live: id === gatheringId, updatedAt: now };
      }
      return { playlists: updated };
    });
    const finalStore = get().playlists[gatheringId];
    console.log('[goLive] done at', new Date().toISOString(), '| Zustand is_live:', finalStore?.is_live, '| gathering:', gatheringId);
  },

  endSession: async (gatheringId) => {
    const { playlists } = get();
    const target = playlists[gatheringId];
    if (!target) return;
    const updated = { ...target, is_live: false, updatedAt: Date.now() };
    set((s) => ({ playlists: { ...s.playlists, [gatheringId]: updated } }));
    await db.gatherings.put(updated);
    await supabase
      .from('gatherings')
      .update({ is_live: false })
      .eq('id', gatheringId);
  },
}));

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
}

function readInitial(): LiveState {
  if (typeof window === "undefined")
    return { setId: null, slideId: null, blackout: false, clear: false, blackoutFadeMs: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { blackoutFadeMs: 0, ...JSON.parse(raw) };
  } catch {}
  return { setId: null, slideId: null, blackout: false, clear: false, blackoutFadeMs: 0 };
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
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      try { getChannel()?.postMessage(snapshot); } catch {}
    }
  },
  go: (setId, slideId) => get().setLive({ setId, slideId, blackout: false, clear: false, blackoutFadeMs: 0 }),
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

  const sc = new BroadcastChannel(SET_SYNC_CHANNEL);
  sc.addEventListener("message", (e) => {
    const updatedSet = e.data as PhytoSet;
    useLibrary.setState((s) => ({
      sets: { ...s.sets, [updatedSet.id]: updatedSet },
    }));
  });
}
