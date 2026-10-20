// Multilanguage: the chord palette lives above the grid (in the song editor's
// controls) but drops chords into whichever grid cell was last focused. The
// palette posts here; the grid applies it.
import { create } from "zustand";

export type GridChordAction = { kind: "insert"; chord: string } | { kind: "clear" };

export const useGridChordBus = create<{
  action: (GridChordAction & { seq: number }) | null;
  post: (a: GridChordAction) => void;
}>((set, get) => ({
  action: null,
  post: (a) => set({ action: { ...a, seq: (get().action?.seq ?? 0) + 1 } }),
}));

/** The word start a caret sits in (or just after): where a palette chord
 *  lands, as in the plain editor. */
export function wordStartAt(text: string, caret: number): number {
  let i = Math.max(0, Math.min(caret, text.length));
  if (i === text.length && i > 0 && text[i - 1] !== " ") i -= 1;
  while (i > 0 && text[i - 1] !== " ") i -= 1;
  while (i < text.length && text[i] === " ") i += 1;
  return i;
}
