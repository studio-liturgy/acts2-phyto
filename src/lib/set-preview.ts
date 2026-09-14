import type { Set as PhytoSet } from "./types";
import { stripChords } from "./chords";

/** A short multi-line, chord-free summary of a set's slides — used for the
 *  duplicate-resolution preview and the shared-set inbox hover preview. */
export function previewText(d: PhytoSet): string {
  if (d.slides.length === 0) return "Empty: no slides.";
  const lines = d.slides.slice(0, 10).map((s) => {
    if (s.lines?.length) return s.lines.map(stripChords).filter(Boolean).join(" / ");
    if (s.reference) return s.reference;
    if (s.title) return s.title;
    if (s.imageUrl) return "[image]";
    if (s.videoUrl || s.youtubeId) return "[video]";
    return "[blank]";
  });
  if (d.slides.length > 10) lines.push("…");
  return lines.join("\n");
}
