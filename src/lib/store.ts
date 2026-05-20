import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Deck, Slide, LiveState, Playlist } from "./types";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

interface LibraryState {
  decks: Record<string, Deck>;
  order: string[];
  playlists: Record<string, Playlist>;
  playlistOrder: string[];
  createDeck: (deck: Omit<Deck, "id" | "createdAt" | "updatedAt">) => string;
  updateDeck: (id: string, patch: Partial<Deck>) => void;
  deleteDeck: (id: string) => void;
  addSlide: (deckId: string, slide: Omit<Slide, "id">) => string;
  updateSlide: (deckId: string, slideId: string, patch: Partial<Slide>) => void;
  removeSlide: (deckId: string, slideId: string) => void;
  reorderSlides: (deckId: string, ids: string[]) => void;
  createPlaylist: (name: string) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addDeckToPlaylist: (playlistId: string, deckId: string) => void;
  removeDeckFromPlaylist: (playlistId: string, deckIdOrIndex: string | number) => void;
  reorderPlaylistDecks: (playlistId: string, deckIds: string[]) => void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      decks: {},
      order: [],
      playlists: {},
      playlistOrder: [],
      createDeck: (deck) => {
        const id = uid();
        const now = Date.now();
        set((s) => ({
          decks: { ...s.decks, [id]: { ...deck, id, createdAt: now, updatedAt: now } },
          order: [id, ...s.order],
        }));
        return id;
      },
      updateDeck: (id, patch) =>
        set((s) => {
          const d = s.decks[id];
          if (!d) return s;
          return { decks: { ...s.decks, [id]: { ...d, ...patch, updatedAt: Date.now() } } };
        }),
      deleteDeck: (id) =>
        set((s) => {
          const { [id]: _gone, ...rest } = s.decks;
          return { decks: rest, order: s.order.filter((x) => x !== id) };
        }),
      addSlide: (deckId, slide) => {
        const id = uid();
        set((s) => {
          const d = s.decks[deckId];
          if (!d) return s;
          return {
            decks: {
              ...s.decks,
              [deckId]: { ...d, slides: [...d.slides, { ...slide, id }], updatedAt: Date.now() },
            },
          };
        });
        return id;
      },
      updateSlide: (deckId, slideId, patch) =>
        set((s) => {
          const d = s.decks[deckId];
          if (!d) return s;
          return {
            decks: {
              ...s.decks,
              [deckId]: {
                ...d,
                slides: d.slides.map((sl) => (sl.id === slideId ? { ...sl, ...patch } : sl)),
                updatedAt: Date.now(),
              },
            },
          };
        }),
      removeSlide: (deckId, slideId) =>
        set((s) => {
          const d = s.decks[deckId];
          if (!d) return s;
          return {
            decks: {
              ...s.decks,
              [deckId]: {
                ...d,
                slides: d.slides.filter((sl) => sl.id !== slideId),
                updatedAt: Date.now(),
              },
            },
          };
        }),
      reorderSlides: (deckId, ids) =>
        set((s) => {
          const d = s.decks[deckId];
          if (!d) return s;
          const map = new Map(d.slides.map((sl) => [sl.id, sl]));
          const slides = ids.map((i) => map.get(i)!).filter(Boolean);
          return { decks: { ...s.decks, [deckId]: { ...d, slides, updatedAt: Date.now() } } };
        }),
      createPlaylist: (name) => {
        const id = uid();
        const now = Date.now();
        set((s) => ({
          playlists: {
            ...s.playlists,
            [id]: { id, name, deckIds: [], createdAt: now, updatedAt: now },
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
      addDeckToPlaylist: (playlistId, deckId) =>
        set((s) => {
          const p = s.playlists[playlistId];
          if (!p) return s;
          // Allow the same deck to appear multiple times in a gathering.
          return {
            playlists: {
              ...s.playlists,
              [playlistId]: { ...p, deckIds: [...p.deckIds, deckId], updatedAt: Date.now() },
            },
          };
        }),
      removeDeckFromPlaylist: (playlistId, deckIdOrIndex) =>
        set((s) => {
          const p = s.playlists[playlistId];
          if (!p) return s;
          let deckIds: string[];
          if (typeof deckIdOrIndex === "number") {
            deckIds = p.deckIds.filter((_, i) => i !== deckIdOrIndex);
          } else {
            // Remove only the first occurrence so duplicates are preserved.
            const idx = p.deckIds.indexOf(deckIdOrIndex);
            if (idx === -1) return s;
            deckIds = p.deckIds.filter((_, i) => i !== idx);
          }
          return {
            playlists: {
              ...s.playlists,
              [playlistId]: { ...p, deckIds, updatedAt: Date.now() },
            },
          };
        }),
      reorderPlaylistDecks: (playlistId, deckIds) =>
        set((s) => {
          const p = s.playlists[playlistId];
          if (!p) return s;
          return {
            playlists: {
              ...s.playlists,
              [playlistId]: { ...p, deckIds, updatedAt: Date.now() },
            },
          };
        }),
    }),
    { name: "stage-library-v1" }
  )
);

// --- Live presentation state, synced across windows via BroadcastChannel ---

const CHANNEL = "stage-live-v1";
const STORAGE_KEY = "stage-live-v1";

interface LiveStore extends LiveState {
  setLive: (patch: Partial<LiveState>) => void;
  go: (deckId: string, slideId: string) => void;
  clearLive: () => void;
  toggleBlackout: () => void;
  toggleClear: () => void;
}

function readInitial(): LiveState {
  if (typeof window === "undefined")
    return { deckId: null, slideId: null, blackout: false, clear: false, blackoutFadeMs: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { blackoutFadeMs: 0, ...JSON.parse(raw) };
  } catch {}
  return { deckId: null, slideId: null, blackout: false, clear: false, blackoutFadeMs: 0 };
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
    const next = { ...get(), ...patch } as LiveState;
    set(patch);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      getChannel()?.postMessage(next);
    }
  },
  go: (deckId, slideId) => get().setLive({ deckId, slideId, blackout: false, clear: false }),
  clearLive: () => get().setLive({ deckId: null, slideId: null, blackout: false, clear: false }),
  toggleBlackout: () => get().setLive({ blackout: !get().blackout }),
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
