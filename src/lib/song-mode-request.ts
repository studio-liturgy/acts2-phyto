// The song editor's Mode dropdown sits in the page header, but changing mode
// is the lyrics editor's job (it may ask which language first, and it owns the
// words). The header posts the request here; the editor picks it up.
import { create } from "zustand";
import type { SongLayout } from "./song-layout";

export const useSongModeRequest = create<{
  request: { setId: string; mode: SongLayout } | null;
  ask: (setId: string, mode: SongLayout) => void;
  clear: () => void;
}>((set) => ({
  request: null,
  ask: (setId, mode) => set({ request: { setId, mode } }),
  clear: () => set({ request: null }),
}));
