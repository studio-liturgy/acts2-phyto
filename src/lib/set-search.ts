import { stripChords } from "./chords";
import { stripInlineFormat } from "./inline-format";

type Searchable = { name: string; slides: { lines?: string[] }[] };

/** Scripts written without spaces between words, where any match is a word start. */
const NO_SPACES =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
const WORD_CHAR = /[\p{L}\p{N}'’]/u;

/** Whether `q` appears in `name` starting at the beginning of a word. */
function atWordStart(name: string, q: string): boolean {
  if (NO_SPACES.test(q)) return name.includes(q);
  for (let i = name.indexOf(q); i >= 0; i = name.indexOf(q, i + 1)) {
    if (i === 0 || !WORD_CHAR.test(name[i - 1])) return true;
  }
  return false;
}

/**
 * How well a set matches a search, best first (his pick, Nov 19, the way
 * music apps rank): 0 = the name is the search, 1 = the name starts with
 * it, 2 = a word in the name starts with it, 3 = only its words (lyrics) contain
 * it, -1 = no match. A search found only inside a word of the name ("no" in
 * "Enough") doesn't count as a name match. Chords and inline formatting
 * don't count. `q` is already trimmed and lower-cased; empty matches
 * everything.
 */
export function searchRank(d: Searchable, q: string): number {
  if (!q) return 0;
  const name = d.name.toLowerCase().trim();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (atWordStart(name, q)) return 2;
  const inWords = d.slides.some((slide) =>
    slide.lines?.some((line) => stripInlineFormat(stripChords(line)).toLowerCase().includes(q)),
  );
  return inWords ? 3 : -1;
}

/** A set matches a search when its name or any of its words contain it. */
export function setMatchesSearch(d: Searchable, q: string): boolean {
  return searchRank(d, q) >= 0;
}

/**
 * Search results in `searchRank` order: the exact name, names starting with
 * the search, names with a word starting with it, then sets that match only
 * in their words. Each group keeps the order it came in (the list's own
 * sort); sets that don't match are dropped.
 */
export function rankBySearch<T extends Searchable>(list: T[], q: string): T[] {
  if (!q) return list;
  const groups: T[][] = [[], [], [], []];
  for (const d of list) {
    const r = searchRank(d, q);
    if (r >= 0) groups[r].push(d);
  }
  return groups.flat();
}
