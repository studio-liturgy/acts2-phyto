export type SlideKind = "lyric" | "scripture" | "image" | "video" | "blank";

/** Where a video slide's media comes from.
 *  "youtube" → embedded via youtube-nocookie; "file" → uploaded to R2;
 *  "url" → direct external video URL played in a <video> element. */
export type VideoSource = "youtube" | "file" | "url";

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
  /** Video-only: where the media comes from. */
  videoSource?: VideoSource;
  /** Video-only: R2 public URL ("file") or direct external URL ("url"). */
  videoUrl?: string;
  /** Video-only: parsed 11-char YouTube id (when videoSource === "youtube"). */
  youtubeId?: string;
  /** Video-only: start playing automatically when the slide goes live.
   *  Default falsey = click-to-start (operator presses Play). */
  autoplay?: boolean;
}

export type SetKind = "song" | "scripture" | "media" | "mixed";

export interface SetTemplate {
  /** Multiplier on slide text sizes. 1 = current/smallest. */
  fontScale?: number;
  /** CSS font-family stack applied to slide content. */
  fontFamily?: string;
  /** Background mode for the slide. */
  bg?: "black" | "white";
  /** Text alignment. Default "center". */
  align?: "center" | "left";
  /** Where the verse reference is rendered relative to the text. Default "below". */
  referencePosition?: "above" | "below";
  /** Vertical position of song text on the slide. Default "centre". */
  position?: "top" | "centre";
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

export interface Gathering {
  id: string;
  name: string;
  setIds: string[];
  share_token: string;
  /** Live status. Server-authoritative: `true`/`false` reflect Supabase;
   *  `null` means logged-out/unknown (no local truth). */
  is_live: boolean | null;
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
  /** Video playback command, broadcast to the output window. `nonce` increments
   *  on every press so the output reacts even when repeating a prior action. */
  videoCmd?: { action: "play" | "pause" | "restart" | "stop"; nonce: number };
  /** Set by the output window when the current video reaches its end, so the
   *  presenter knows the next →/Space should advance the slide. */
  videoEnded?: boolean;
}
