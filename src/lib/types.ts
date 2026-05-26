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

export type SetKind = "song" | "scripture" | "media" | "mixed";

export interface SetTemplate {
  /** Multiplier on slide text sizes. 1 = current/smallest. */
  fontScale?: number;
  /** CSS font-family stack applied to slide content. */
  fontFamily?: string;
  /** Background mode for the slide. */
  bg?: "black" | "white";
}

export interface Set {
  id: string;
  name: string;
  kind: SetKind;
  slides: Slide[];
  /** Visual template applied to all slides in this set. */
  template?: SetTemplate;
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
  setIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface LiveState {
  setId: string | null;
  slideId: string | null;
  blackout: boolean;
  clear: boolean; // logo / clear screen
  /** Cross-fade duration for blackout transitions (ms). 0 = instant. */
  blackoutFadeMs?: number;
}
