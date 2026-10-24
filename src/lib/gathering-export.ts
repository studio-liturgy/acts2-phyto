// Export a gathering as one PDF or PPTX: every set in run order, each slide as
// it looks on the output screen. This file holds the pure parts (which slides,
// in what order, with which template; file names; video poster sources) so
// they can be unit tested. Rendering and file building live in
// gathering-export-render.tsx.

import { arrangedSequence, effectiveArrangement } from "./arrangements";
import { hiddenSlideIds } from "./sections";
import type { Gathering, Set as PhytoSet, SetTemplate, Slide } from "./types";
import { visibleVersions } from "./versions";

export type ExportFormat = "pdf" | "pptx";

export interface ExportSlide {
  setId: string;
  slide: Slide;
  template: SetTemplate | undefined;
  versions: string[] | undefined;
}

export interface ExportContext {
  sets: Record<string, PhytoSet>;
  songTemplate: SetTemplate | undefined;
  scriptureTemplate: SetTemplate | undefined;
  /** Workspace setting: songs play in their per-gathering arrangement. */
  arrangementsOn: boolean;
  /** This gathering's stored arrangements and hidden sections, by set id. */
  arranged: Record<string, string[]>;
  hidden: Record<string, string[]>;
}

/** The template a set is drawn with, the same choice the output window makes. */
export function templateForSet(
  set: PhytoSet,
  songTemplate: SetTemplate | undefined,
  scriptureTemplate: SetTemplate | undefined,
): SetTemplate | undefined {
  if (set.kind === "song") return songTemplate;
  if (set.kind === "scripture" || set.kind === "message") return scriptureTemplate;
  return set.template;
}

/** A set's slides in the order the presenter plays them: an arranged song
 *  follows its arrangement (repeats included), anything else its written
 *  order minus sections hidden with the eye. */
export function playedSlides(set: PhytoSet, ctx: ExportContext): Slide[] {
  const hidden = ctx.hidden[set.id] ?? [];
  if (ctx.arrangementsOn && set.kind === "song") {
    const arrangement = effectiveArrangement(set.slides, ctx.arranged[set.id], hidden);
    const byId = new Map(set.slides.map((s) => [s.id, s]));
    return arrangedSequence(set.slides, arrangement)
      .map((p) => byId.get(p.slideId))
      .filter((s): s is Slide => !!s);
  }
  const hiddenIds = hiddenSlideIds(set.slides, hidden);
  return set.slides.filter((s) => !hiddenIds.has(s.id));
}

/** One set's slides for the set editor's export: every slide as written
 *  (hidden sections and arrangements belong to a gathering, not the set). */
export function setExportSlides(
  set: PhytoSet,
  songTemplate: SetTemplate | undefined,
  scriptureTemplate: SetTemplate | undefined,
): ExportSlide[] {
  const template = templateForSet(set, songTemplate, scriptureTemplate);
  const versions = visibleVersions(set);
  return set.slides.map((slide) => ({ setId: set.id, slide, template, versions }));
}

/** Every slide of the gathering, in run order, with what it's drawn with.
 *  Sets missing from the library (not synced yet) are skipped. */
export function gatheringExportSlides(gathering: Gathering, ctx: ExportContext): ExportSlide[] {
  const out: ExportSlide[] = [];
  for (const setId of gathering.setIds) {
    const set = ctx.sets[setId];
    if (!set) continue;
    const template = templateForSet(set, ctx.songTemplate, ctx.scriptureTemplate);
    const versions = visibleVersions(set);
    for (const slide of playedSlides(set, ctx)) out.push({ setId, slide, template, versions });
  }
  return out;
}

/** "Sunday 9am" → "Sunday 9am.pdf". Characters file systems reject become
 *  spaces; an empty name falls back to "Gathering". */
export function exportFileName(name: string, format: ExportFormat): string {
  const clean = Array.from(name, (ch) =>
    ch.charCodeAt(0) < 0x20 || '\\/:*?"<>|'.includes(ch) ? " " : ch,
  )
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return `${clean || "Gathering"}.${format}`;
}

/** Where a video slide's still frame comes from: a YouTube thumbnail URL, a
 *  video file to grab a frame from, or nothing (drawn as a black slide). */
export type VideoPoster =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | { kind: "none" };

export function videoPosterSource(slide: Slide): VideoPoster {
  if (slide.videoSource === "youtube" && slide.youtubeId) {
    return { kind: "image", url: `https://i.ytimg.com/vi/${slide.youtubeId}/hqdefault.jpg` };
  }
  if ((slide.videoSource === "file" || slide.videoSource === "url") && slide.videoUrl) {
    return { kind: "video", url: slide.videoUrl };
  }
  return { kind: "none" };
}

/** Our R2 media domains (prod and test). Both apps read both: test shares the
 *  prod database, so a set made on phyto.live shows prod media on test too. */
export const MEDIA_HOSTS = ["media.phyto.live", "media.phytoexp.live"];

/** True for an https URL on one of our media domains. */
export function isOwnMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && MEDIA_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Media on our own domains is read through /api/media/raw (same origin) so
 *  the browser may draw it into a canvas: the media domains send no CORS
 *  headers. Anything else is fetched as it is. */
export function exportFetchUrl(url: string): string {
  return isOwnMediaUrl(url) ? `/api/media/raw?u=${encodeURIComponent(url)}` : url;
}

/** Fit a w×h picture inside a W×H frame without cropping (letterboxed). */
export function containRect(
  w: number,
  h: number,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number } {
  if (w <= 0 || h <= 0) return { x: 0, y: 0, w: W, h: H };
  const s = Math.min(W / w, H / h);
  const dw = w * s;
  const dh = h * s;
  return { x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh };
}
