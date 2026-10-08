// YouVersion Platform (api.youversion.com): the Bible text phyto fetches first.
// bolls.life (lib/bible.ts) only serves the versions YouVersion doesn't have.
//
// How YouVersion codes things, which phyto follows:
//  - A Bible is a number (NIV is 111). Abbreviations repeat across languages
//    (three Bibles are "NVI"), so the number is the identity; phyto stores it
//    as "yv:111".
//  - Its language is a BCP 47 tag: the 2-letter ISO 639-1 code where one
//    exists ("en", "ko"), else the 3-letter ISO 639-3 one ("cak"); a script
//    subtag only when it isn't the language's usual one ("zh-Hant-TW",
//    "hi-Latn"); a region only for a regional edition ("es-ES", "pt-PT").
//    Simplified Chinese is plain "zh". phyto's language codes (lib/langs.ts)
//    are these same tags.
//  - A passage is USFM: "JHN.3.16-18", "PSA.23", one chapter per request.

import catalog from "./youversion-catalog.json";

const API = "https://api.youversion.com/v1";

export interface YvBible {
  id: number;
  /** BCP 47 language tag, e.g. "en", "zh-Hant-TW". */
  tag: string;
  /** The abbreviation as the Bible's own language writes it ("NIV", "KLB"). */
  abbr: string;
}

/** Every Bible the app key can read, from the snapshot
 *  scripts/youversion-catalog.mjs writes: just what labels and typography
 *  need at once. Titles and language names load separately (loadYvNames). */
export const YV_BIBLES: readonly YvBible[] = (
  catalog.bibles as unknown as [number, string, string][]
).map(([id, tag, abbr]) => ({ id, tag, abbr }));

// --- Titles and language names: ~45 KB gzipped, so only fetched when a version
// picker or the Terms page wants them, not for every page that shows a slide.
type Names = {
  titles: Record<string, [string, string]>;
  languages: Record<string, string>;
};
let names: Names | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Load the Bibles' titles and the languages' names, once. */
export function loadYvNames(): Promise<void> {
  loading ??= import("./youversion-names.json").then((m) => {
    names = m.default as unknown as Names;
    for (const l of listeners) l();
  });
  return loading;
}

/** Whether loadYvNames has finished. */
export function yvNamesLoaded(): boolean {
  return names !== null;
}

/** Called once the names arrive (for useSyncExternalStore). */
export function subscribeYvNames(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A Bible's title in its own language ("현대인의 성경") and in English
 *  ("Korean Living Bible 1985"); undefined until the names have loaded. */
export function yvTitles(id: number): { title: string; english: string } | undefined {
  const t = names?.titles[id];
  return t ? { title: t[0], english: t[1] || t[0] } : undefined;
}

/** A language's English name ("Korean", "Spanish (Spain)"); undefined until
 *  the names have loaded. */
export function yvLanguageName(tag: string): string | undefined {
  return names?.languages[tag];
}

/** USFM book codes in canonical (Protestant) order: book id N is index N-1,
 *  the same numbering bolls.life and phyto's reference parser use. */
// prettier-ignore
export const USFM_BOOKS = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI",
  "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER",
  "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP",
  "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL",
  "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE",
  "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
] as const;

async function yvGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  // Sent with every request: VITE_YOUVERSION_APP_KEY, in .env and the deploy
  // workflows' secrets. The browser calls the API directly.
  const key = import.meta.env.VITE_YOUVERSION_APP_KEY as string | undefined;
  if (!key) throw new Error("YouVersion isn't set up on this build (no app key).");
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { "X-YVP-App-Key": key },
  });
  if (res.status === 404) throw new Error("That passage isn't in this version.");
  // The key is rate-limited (a 429 asks for a few minutes' pause).
  if (res.status === 429) throw new Error("YouVersion is busy. Try again in a few minutes.");
  if (!res.ok) throw new Error(`Lookup failed (${res.status}). Try again in a moment.`);
  return (await res.json()) as T;
}

/** One verse of a chapter, as YouVersion marks it up. A merged verse ("6-7"
 *  in some paraphrases) is numbered by its first verse, with `endVerse`. */
export interface YvVerse {
  verse: number;
  endVerse?: number;
  text: string;
}

// Block elements that are headings, not verse text: the psalm title (d),
// section headings (s, s1…), major sections (ms, mr), cross-reference lines
// (r, sr), speakers (sp), chapter labels (cl), acrostic letters (qa), titles
// (mt). YouVersion leaves most of them out unless asked, but always keeps a
// psalm's title.
const HEADING_DIV =
  /<div class="(?:d|s\d?|ms\d?|mr|r|sr|sp|cl|qa|qd|mt\d?|mte\d?|sd\d?)"[^>]*>[\s\S]*?<\/div>/g;
const VERSE_MARK = /<span class="yv-v"([^>]*)><\/span>/g;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Some CJK editions put a space between every character: drop the spaces
// between Han/kana and CJK punctuation so lines break under CJK rules
// (Korean spaces its words, so it's untouched).
const CJK_SPACE =
  /(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef])[ \t]+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef])/gu;

/**
 * A chapter's (or passage's) verses from YouVersion's HTML. Each verse opens
 * with an empty `<span class="yv-v" v="16">` marker, so the text between two
 * markers is one verse. Each line of poetry and each paragraph is its own
 * `<div>`: those become line breaks when `keepLineBreaks`, else spaces.
 * Verse labels, headings and the psalm title are dropped; a verse the
 * translation omits ("[21]") has no text and is skipped. Exported for tests.
 */
export function parseYvHtml(html: string, keepLineBreaks: boolean): YvVerse[] {
  const body = html
    .replace(HEADING_DIV, "")
    .replace(/<span class="yv-vlbl"[^>]*>[\s\S]*?<\/span>/g, "")
    .replace(/<\/div>|<br\s*\/?>/g, "\n");

  const verses: YvVerse[] = [];
  const marks = [...body.matchAll(VERSE_MARK)];
  marks.forEach((m, i) => {
    const attr = (name: string) => new RegExp(`\\b${name}="(\\d+)"`).exec(m[1])?.[1];
    const verse = Number(attr("v"));
    if (!verse) return;
    const end = Number(attr("ev"));
    const start = m.index + m[0].length;
    const raw = body.slice(start, i + 1 < marks.length ? marks[i + 1].index : undefined);
    let text = decodeEntities(raw.replace(/<[^>]*>/g, "")).replace(CJK_SPACE, "");
    text = keepLineBreaks
      ? text
          .split("\n")
          .map((l) => l.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\n")
      : text.replace(/\s+/g, " ").trim();
    if (!text) return;
    verses.push({ verse, ...(end > verse ? { endVerse: end } : {}), text });
  });
  return verses;
}

/** "요한복음 3:16" -> "요한복음": the book name a passage's reference opens
 *  with, in the Bible's own language. Exported for tests. */
export function bookNameFromReference(reference: string): string {
  return reference
    .replace(/[\s\u200e\u200f\u061c]*[\p{Nd}:：.,\-–—]+[\s\u200e\u200f\u061c]*$/u, "")
    .trim();
}

const chapterCache = new Map<string, Promise<{ bookName: string; html: string }>>();

/** One chapter in a YouVersion Bible: its verses and the book's name in the
 *  Bible's own language. Cached per chapter (both versions of a two-version
 *  import, and re-imports, reuse it). */
export async function fetchYvChapter(
  bibleId: number,
  bookId: number,
  chapter: number,
  keepLineBreaks: boolean,
): Promise<{ bookName: string; verses: YvVerse[] }> {
  const usfm = USFM_BOOKS[bookId - 1];
  if (!usfm) throw new Error("Unknown book.");
  const key = `${bibleId}/${usfm}.${chapter}`;
  let pending = chapterCache.get(key);
  if (!pending) {
    pending = yvGet<{ content?: string; reference?: string }>(
      `/bibles/${bibleId}/passages/${usfm}.${chapter}`,
      { format: "html" },
    ).then((d) => ({ bookName: bookNameFromReference(d.reference ?? ""), html: d.content ?? "" }));
    chapterCache.set(key, pending);
    // A failed lookup isn't remembered: the next try asks again.
    pending.catch(() => chapterCache.delete(key));
  }
  const { bookName, html } = await pending;
  return { bookName, verses: parseYvHtml(html, keepLineBreaks) };
}

/** A Bible's book names, by book id: `names` (title and full title, matched
 *  loosely) and `abbrs` (short forms like "창", matched only exactly). */
export interface YvBookNames {
  names: Map<number, string[]>;
  abbrs: Map<number, string[]>;
}

const booksCache = new Map<number, Promise<YvBookNames>>();

/** The book names of a YouVersion Bible, for reading a reference typed in its
 *  language. The response carries the whole chapter/verse index (~200 KB), so
 *  it's only fetched when a reference doesn't parse in English, once per
 *  Bible. Empty on failure. */
export function fetchYvBookNames(bibleId: number): Promise<YvBookNames> {
  let pending = booksCache.get(bibleId);
  if (!pending) {
    pending = yvGet<{
      data?: { id: string; title?: string; full_title?: string; abbreviation?: string }[];
    }>(`/bibles/${bibleId}/books`)
      .then(({ data }) => {
        const names = new Map<number, string[]>();
        const abbrs = new Map<number, string[]>();
        for (const b of data ?? []) {
          const id = (USFM_BOOKS as readonly string[]).indexOf(b.id) + 1;
          if (!id) continue;
          names.set(
            id,
            [b.title, b.full_title].filter((n): n is string => !!n),
          );
          if (b.abbreviation) abbrs.set(id, [b.abbreviation]);
        }
        return { names, abbrs };
      })
      .catch(() => ({ names: new Map<number, string[]>(), abbrs: new Map<number, string[]>() }));
    booksCache.set(bibleId, pending);
  }
  return pending;
}
