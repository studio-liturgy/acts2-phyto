export type SlideKind = "lyric" | "scripture" | "image" | "blank";

export interface Slide {
  id: string;
  kind: SlideKind;
  title?: string;
  /** lines of text shown on the slide (each rendered as its own line) */
  lines?: string[];
  /** reference/caption shown on the slide (e.g. "John 3:16"). Hidden for songs. */
  reference?: string;
  /** Manual section label used for grouping (e.g. "Chorus", "Verse 1", "Intro").
   *  Independent of `reference` so scripture slides can keep their verse ref. */
  section?: string;
  /** data URL or external URL for an image slide / background */
  imageUrl?: string;
}

export type DeckKind = "song" | "scripture" | "media" | "mixed";

export interface Deck {
  id: string;
  name: string;
  kind: DeckKind;
  slides: Slide[];
  /** Media-only: auto-advance to next slide after N ms. 0 = off. */
  autoAdvanceMs?: number;
  /** Media-only: when auto-advancing, loop from end back to start. */
  loop?: boolean;
  /** Media-only: cross-dissolve duration in ms between slides. */
  dissolveMs?: number;
  createdAt: number;
  updatedAt: number;
}


export interface Playlist {
  id: string;
  name: string;
  deckIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface LiveState {
  deckId: string | null;
  slideId: string | null;
  blackout: boolean;
  clear: boolean; // logo / clear screen
  /** Cross-fade duration for blackout transitions (ms). 0 = instant. */
  blackoutFadeMs?: number;
}
