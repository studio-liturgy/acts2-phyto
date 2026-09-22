import type { SongChords } from "./chords";

export type SlideKind = "lyric" | "scripture" | "image" | "video" | "blank" | "point";

/** A "point" in a message set: a quote, a bulleted list, or a single statement. */
export type PointType = "quote" | "bullets" | "statement";

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
  /** Image slides (media) and message images: how the image fills its frame.
   *  "contain" (default) shows the whole image; "cover" fills the frame. Both
   *  preserve aspect ratio — the image is never stretched. Toggled per image. */
  imageFit?: "contain" | "cover";
  /** Scripture typed in by hand rather than fetched from a bible API: its
   *  reference is whatever the user wrote (per version, possibly nothing), and
   *  a change of the set's versions leaves its text where it is. */
  manual?: boolean;
  /** Media-only: when a string is present, a section divider labelled with it
   *  sits immediately AFTER this slide, starting a new section for the slides
   *  that follow. Sections are coloured in the editor and the presenter and
   *  named in the phone view; playback is unaffected. */
  sectionAfter?: string;
  /** Media-only, first slide only: the name of the first section (the one
   *  before any divider). Kept on whichever slide is first. */
  sectionBefore?: string;
  /** Video-only: where the media comes from. */
  videoSource?: VideoSource;
  /** Video-only: R2 public URL ("file") or direct external URL ("url"). */
  videoUrl?: string;
  /** Video-only: parsed 11-char YouTube id (when videoSource === "youtube"). */
  youtubeId?: string;
  /** Video-only: start playing automatically when the slide goes live.
   *  Default falsey = click-to-start (operator presses Play). */
  autoplay?: boolean;
  /** Scripture-only: which import (0-based) this verse came from, so two imports
   *  of the same reference stay separate groups in the editor and slide grid
   *  rather than merging under one shared `section`. */
  importIndex?: number;
  /** Scripture-only: one verse per bible version, keyed by version code. Only a
   *  single version is surfaced today; the second is hidden until dual-translation
   *  ships. `lines` stays populated with the primary so everything that predates
   *  this keeps working. */
  linesByVersion?: Record<string, string>;
  /** Scripture-only: the reference per version, so a translation can show its own
   *  localized book name. Keyed like linesByVersion. */
  referencesByVersion?: Record<string, string>;
  /** Message-only (kind === "point"): which preset layout this point uses.
   *  Quote → `lines` is the quotation + `attribution`; Bullets → `title` heading
   *  + `lines` bullets; Statement → `lines` is one short line. */
  pointType?: PointType;
  /** Message-only: who a quote is attributed to. */
  attribution?: string;
  /** Message-only (pointType === "bullets"): numbered list instead of dots.
   *  Absent = bullet dots. */
  listStyle?: "bullets" | "numbers";
}

export type SetKind = "song" | "scripture" | "media" | "mixed" | "message";

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
  /** Song-only: how lyric text is cased on the slide. Default "mixed" (as typed). */
  textCase?: "upper" | "mixed";
}

export interface Set {
  id: string;
  name: string;
  kind: SetKind;
  slides: Slide[];
  /** Visual template applied to all slides in this set. */
  template?: SetTemplate;
  /** Song-only: how the chords typed inline in the lyrics are displayed.
   *  Absent = the song has no chords configured. Chords are never projected;
   *  this only governs the phone view. */
  chords?: SongChords;
  /** Media-only: auto-advance to next slide after N ms. 0 = off. */
  autoAdvanceMs?: number;
  /** Media-only: when auto-advancing, loop from end back to start. */
  loop?: boolean;
  /** Media-only: cross-dissolve duration in ms between slides. */
  dissolveMs?: number;
  /** Media-only, with loop: auto advance loops within the current section
   *  (between its dividers) instead of the whole set. */
  loopSection?: boolean;
  /** Scripture/message: whether an imported passage's reference carries its
   *  version code ("John 3:16 NIV"), on the editor's reference line and on the
   *  slide. Absent = on. Toggling it rewrites the existing references too. */
  versionRefs?: boolean;
  /** Scripture/message: the bible versions (translation codes) on each verse
   *  slide, in stacking order; one entry for a single translation, two when a
   *  second was imported alongside. Which of them a workspace shows is decided
   *  by its settings (see lib/versions.ts). */
  versions?: string[];
  /** Scripture/message: the reference queries imported so far, so a version
   *  change can re-fetch the same passages. */
  scriptureImports?: string[];
  /** Deprecated: the original single-workspace tag. Group membership now works
   *  through GRANTS (group_sets → local `groupIds`), so a set can live in Personal
   *  and several groups at once. Kept for backward compat / the RLS predicate. */
  group_id?: string | null;
  /** Groups this set is shared to (grant ids). A set can be in Personal (its
   *  owner's library) AND several groups. Derived from group_sets on sync. */
  groupIds?: string[];
  /** True when this is a FOREIGN row — a set owned by someone else that reaches
   *  me via a share or a group grant. Foreign rows sync through the collaborative
   *  path, not the personal engine (excluded from the personal diff, pushed
   *  without rewriting `user_id`). Absent = my own row. */
  shared?: boolean;
  /** The owner's email — shown so collaborators can see whose set it is (in the
   *  editor, and per-set in a group catalogue). Set for foreign rows, and for my
   *  own rows once they're granted to a group. */
  shared_by?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Gathering {
  id: string;
  name: string;
  setIds: string[];
  share_token: string;
  /** Group workspace this gathering belongs to, or absent/null for personal. */
  group_id?: string | null;
  /** True for a FOREIGN group gathering (contributed by another member) that I
   *  see and edit collaboratively. Excluded from the personal diff; pushed via
   *  toSupabaseGatheringShared (no user_id rewrite), pulled/pruned by syncGroups.
   *  My own gatherings (including ones I created in a group) leave this unset. */
  shared?: boolean;
  /** For a foreign group gathering, the contributor's email (display only). */
  shared_by?: string;
  /** Live status. Server-authoritative: `true`/`false` reflect Supabase;
   *  `null` means logged-out/unknown (no local truth).
   *  Read this through `isLiveNow()` — a session that was never manually ended
   *  keeps `is_live` true past its 24h window. See lib/live-session.ts. */
  is_live: boolean | null;
  /** Epoch ms when the current live session started, or `null` when not live.
   *  Server-authoritative (stamped by a trigger); pairs with `is_live` to give
   *  the 24h auto-expiry. */
  live_started_at: number | null;
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
