import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Set as PhytoSet, Slide, LiveState, Playlist, SetTemplate } from "./types";

function uid() {
  return Math.random().toString(36).slice(2, 10);
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
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      sets: {},
      order: [],
      playlists: {},
      playlistOrder: [],
      songTemplate: { fontScale: 1, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", bg: "black" },
      setSongTemplate: (patch) =>
        set((s) => ({ songTemplate: { ...s.songTemplate, ...patch } })),
      createSet: (newSet) => {
        const id = uid();
        const now = Date.now();
        set((s) => ({
          sets: { ...s.sets, [id]: { ...newSet, id, createdAt: now, updatedAt: now } },
          order: [id, ...s.order],
        }));
        return id;
      },
      updateSet: (id, patch) =>
        set((s) => {
          const d = s.sets[id];
          if (!d) return s;
          return { sets: { ...s.sets, [id]: { ...d, ...patch, updatedAt: Date.now() } } };
        }),
      deleteSet: (id) =>
        set((s) => {
          const { [id]: _gone, ...rest } = s.sets;
          return { sets: rest, order: s.order.filter((x) => x !== id) };
        }),
      addSlide: (setId, slide) => {
        const id = uid();
        set((s) => {
          const d = s.sets[setId];
          if (!d) return s;
          return {
            sets: {
              ...s.sets,
              [setId]: { ...d, slides: [...d.slides, { ...slide, id }], updatedAt: Date.now() },
            },
          };
        });
        return id;
      },
      updateSlide: (setId, slideId, patch) =>
        set((s) => {
          const d = s.sets[setId];
          if (!d) return s;
          return {
            sets: {
              ...s.sets,
              [setId]: {
                ...d,
                slides: d.slides.map((sl) => (sl.id === slideId ? { ...sl, ...patch } : sl)),
                updatedAt: Date.now(),
              },
            },
          };
        }),
      removeSlide: (setId, slideId) =>
        set((s) => {
          const d = s.sets[setId];
          if (!d) return s;
          return {
            sets: {
              ...s.sets,
              [setId]: {
                ...d,
                slides: d.slides.filter((sl) => sl.id !== slideId),
                updatedAt: Date.now(),
              },
            },
          };
        }),
      reorderSlides: (setId, ids) =>
        set((s) => {
          const d = s.sets[setId];
          if (!d) return s;
          const map = new Map(d.slides.map((sl) => [sl.id, sl]));
          const slides = ids.map((i) => map.get(i)!).filter(Boolean);
          return { sets: { ...s.sets, [setId]: { ...d, slides, updatedAt: Date.now() } } };
        }),
      createPlaylist: (name) => {
        const id = uid();
        const now = Date.now();
        set((s) => ({
          playlists: {
            ...s.playlists,
            [id]: { id, name, setIds: [], createdAt: now, updatedAt: now },
          },
          playlistOrder: [id, ...s.playlistOrder],
        }));
        return id;
      },
      renamePlaylist: (id, name) =>
        set((s) => {
          const p = s.playlists[id];
          if (!p) return s;
          return { playlists: { ...s.playlists, [id]: { ...p, name, updatedAt: Date.now() } } };
        }),
      deletePlaylist: (id) =>
        set((s) => {
          const { [id]: _gone, ...rest } = s.playlists;
          return { playlists: rest, playlistOrder: s.playlistOrder.filter((x) => x !== id) };
        }),
      addSetToPlaylist: (playlistId, setId) =>
        set((s) => {
          const p = s.playlists[playlistId];
          if (!p) return s;
          // Allow the same set to appear multiple times in a gathering.
          return {
            playlists: {
              ...s.playlists,
              [playlistId]: { ...p, setIds: [...p.setIds, setId], updatedAt: Date.now() },
            },
          };
        }),
      removeSetFromPlaylist: (playlistId, setIdOrIndex) =>
        set((s) => {
          const p = s.playlists[playlistId];
          if (!p) return s;
          let setIds: string[];
          if (typeof setIdOrIndex === "number") {
            setIds = p.setIds.filter((_, i) => i !== setIdOrIndex);
          } else {
            // Remove only the first occurrence so duplicates are preserved.
            const idx = p.setIds.indexOf(setIdOrIndex);
            if (idx === -1) return s;
            setIds = p.setIds.filter((_, i) => i !== idx);
          }
          return {
            playlists: {
              ...s.playlists,
              [playlistId]: { ...p, setIds, updatedAt: Date.now() },
            },
          };
        }),
      reorderPlaylistSets: (playlistId, setIds) =>
        set((s) => {
          const p = s.playlists[playlistId];
          if (!p) return s;
          return {
            playlists: {
              ...s.playlists,
              [playlistId]: { ...p, setIds, updatedAt: Date.now() },
            },
          };
        }),
    }),
    {
      name: "stage-library-v1",
      version: 2,
      // Migrate v1 (Deck-named) shape -> v2 (Set-named) shape.
      // Old: { decks, playlists[*].deckIds }. New: { sets, playlists[*].setIds }.
      migrate: (persistedState, _version) => {
        if (!persistedState || typeof persistedState !== "object") return persistedState as LibraryState;
        const ps = persistedState as Record<string, unknown>;
        if (ps.decks && !ps.sets) {
          ps.sets = ps.decks;
          delete ps.decks;
        }
        if (ps.playlists && typeof ps.playlists === "object") {
          const next: Record<string, Playlist> = {};
          for (const [pid, raw] of Object.entries(ps.playlists as Record<string, unknown>)) {
            const p = (raw ?? {}) as Record<string, unknown>;
            const setIds = (p.setIds as string[] | undefined) ?? (p.deckIds as string[] | undefined) ?? [];
            const { deckIds: _drop, ...rest } = p;
            next[pid] = { ...(rest as Omit<Playlist, "setIds">), setIds };
          }
          ps.playlists = next;
        }
        return ps as unknown as LibraryState;
      },
    }
  )
);

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
