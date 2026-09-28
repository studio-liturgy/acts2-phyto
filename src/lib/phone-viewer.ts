// The phone gathering view's data: the shapes callers map onto, and the
// viewer's saved preferences. Kept out of components/PhoneViewer so that file
// exports only components, which React Fast Refresh needs.
import { parseChordLine, type SongChords } from "@/lib/chords";

// ---------------------------------------------------------------------------
// Public shapes — the minimal set/slide the viewer needs, so callers can map
// either a raw Supabase row or a local `Set` onto it.
// ---------------------------------------------------------------------------

export interface PhoneSlide {
  id?: string;
  kind: string;
  title?: string;
  lines?: string[];
  section?: string;
  reference?: string;
  imageUrl?: string;
  videoUrl?: string;
  youtubeId?: string;
  /** Message-only (kind === "point"): the point layout + its attribution. */
  pointType?: "quote" | "bullets" | "statement";
  attribution?: string;
  listStyle?: "bullets" | "numbers";
  /** Scripture-only: which import this verse came from (for grouping). */
  importIndex?: number;
  /** Scripture: one verse text per bible version, and each version's own
   *  (localized) reference. See PhoneSet.versions. */
  linesByVersion?: Record<string, string>;
  referencesByVersion?: Record<string, string>;
  /** Media: section dividers (see Slide). */
  sectionAfter?: string;
  sectionBefore?: string;
}

export interface PhoneSet {
  id: string;
  title: string;
  /** "song" | "scripture" | "media" */
  type: string;
  slides: PhoneSlide[];
  /** Set by the leader in the song editor; absent = no chords configured. */
  chords?: SongChords;
  /** Scripture: the bible versions to show for each passage, in order (what the
   *  gathering's workspace shows). Absent = render the plain `lines`. */
  versions?: string[];
}

export type FontFamily = "sans" | "serif" | "mono";

export interface ViewerPrefs {
  isDark: boolean;
  fontSize: number;
  fontFamily: FontFamily;
  /** Chords are hidden by default — most people here are singing, not playing. */
  showChords: boolean;
}

export function loadPrefs(): ViewerPrefs {
  try {
    return {
      isDark: localStorage.getItem("phyto-viewer-dark") !== "false",
      fontSize: Number(localStorage.getItem("phyto-viewer-fontsize") ?? 1),
      fontFamily: (localStorage.getItem("phyto-viewer-fontfamily") as FontFamily) ?? "sans",
      showChords: localStorage.getItem("phyto-viewer-chords") === "true",
    };
  } catch {
    return { isDark: true, fontSize: 1, fontFamily: "sans", showChords: false };
  }
}

export function savePrefs(prefs: ViewerPrefs) {
  try {
    localStorage.setItem("phyto-viewer-dark", String(prefs.isDark));
    localStorage.setItem("phyto-viewer-fontsize", String(prefs.fontSize));
    localStorage.setItem("phyto-viewer-fontfamily", prefs.fontFamily);
    localStorage.setItem("phyto-viewer-chords", String(prefs.showChords));
  } catch {
    // ignore
  }
}

/**
 * A song offers the chord toggle whenever its lyrics actually carry chords —
 * independent of whether the leader left chords switched on or off in the
 * editor. That toggle only controls the editor's own box and the leader's
 * preview; a viewer here is free to look at chords the leader isn't.
 */
export function phoneSetHasChords(set: PhoneSet): boolean {
  if (set.type !== "song") return false;
  return (set.slides ?? []).some((s) => s.lines?.some((l) => parseChordLine(l).chords.length > 0));
}
