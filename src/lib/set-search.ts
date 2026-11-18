import { stripChords } from "./chords";
import { stripInlineFormat } from "./inline-format";

type Searchable = { name: string; slides: { lines?: string[] }[] };

/**
 * How a set matches a search: 0 = its name contains it, 1 = only its words
 * do (chords and inline formatting don't count, as in the catalogue), -1 =
 * no match. `q` is already trimmed and lower-cased; empty matches
 * everything.
 */
export function searchRank(d: Searchable, q: string): number {
  if (!q || d.name.toLowerCase().includes(q)) return 0;
  const inWords = d.slides.some((slide) =>
    slide.lines?.some((line) => stripInlineFormat(stripChords(line)).toLowerCase().includes(q)),
  );
  return inWords ? 1 : -1;
}

/** A set matches a search when its name or any of its words contain it. */
export function setMatchesSearch(d: Searchable, q: string): boolean {
  return searchRank(d, q) >= 0;
}

/**
 * Search results with name matches first, then sets that match only in
 * their words. Each group keeps the order it came in (the list's own sort);
 * sets that don't match are dropped.
 */
export function rankBySearch<T extends Searchable>(list: T[], q: string): T[] {
  if (!q) return list;
  const byName: T[] = [];
  const byWords: T[] = [];
  for (const d of list) {
    const r = searchRank(d, q);
    if (r === 0) byName.push(d);
    else if (r === 1) byWords.push(d);
  }
  return [...byName, ...byWords];
}
