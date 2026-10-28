import { stripChords } from "./chords";
import { stripInlineFormat } from "./inline-format";

type Searchable = { name: string; slides: { lines?: string[] }[] };

/**
 * A set matches a search when its name or any of its words contain it, as in
 * the catalogue: chords and inline formatting don't count. `q` is already
 * trimmed and lower-cased; empty matches everything.
 */
export function setMatchesSearch(d: Searchable, q: string): boolean {
  if (!q) return true;
  if (d.name.toLowerCase().includes(q)) return true;
  return d.slides.some((slide) =>
    slide.lines?.some((line) => stripInlineFormat(stripChords(line)).toLowerCase().includes(q)),
  );
}
