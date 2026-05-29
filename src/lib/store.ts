import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Set as PhytoSet, Slide, LiveState, Playlist, SetTemplate } from "./types";
import { db } from "./db";
import { pushToSupabase } from "./sync";

function uid() {
  return crypto.randomUUID();
}

// Debounce pushToSupabase so rapid consecutive mutations fire only one push.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
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
  /** Populate store from Dexie — call once on app mount. */
  loadFromDb: () => Promise<void>;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  sets: {},
  order: [],
  playlists: {},
  playlistOrder: [],
  songTemplate: { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black" },

  loadFromDb: async () => {
    const [allSets, allGatherings] = await Promise.all([
      db.sets.toArray(),
      db.gatherings.toArray(),
    ]);
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
    set((s) => ({ songTemplate: { ...s.songTemplate, ...patch } })),

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
      return { sets: { ...s.sets, [id]: updated } };
    }),

  deleteSet: (id) =>
    set((s) => {
      const { [id]: _gone, ...rest } = s.sets;
      db.sets.delete(id).then(() => schedulePush());
      return { sets: rest, order: s.order.filter((x) => x !== id) };
    }),

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

  deletePlaylist: (id) =>
    set((s) => {
      const { [id]: _gone, ...rest } = s.playlists;
      db.gatherings.delete(id).then(() => schedulePush());
      return { playlists: rest, playlistOrder: s.playlistOrder.filter((x) => x !== id) };
    }),

  addSetToPlaylist: (playlistId, setId) =>
    set((s) => {
      const p = s.playlists[playlistId];
      if (!p) return s;
      const updated = { ...p, setIds: [...p.setIds, setId], updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush());
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
  });
}
