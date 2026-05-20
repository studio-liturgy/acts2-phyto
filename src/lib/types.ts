export type SlideKind = "lyric" | "scripture" | "image" | "blank";

export interface Slide {
  id: string;
  kind: SlideKind;
  title?: string;
  /** lines of text shown on the slide (each rendered as its own line) */
  lines?: string[];
  /** reference/caption (e.g. "John 3:16" or song section "Chorus") */
  reference?: string;
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
}
