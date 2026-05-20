// Bible reference parsing + bolls.life API integration
// bolls.life supports many copyrighted translations free (NIV, NLT, ESV, NRSV, NASB, NKJV, KJV, ...)

export const TRANSLATIONS = [
  { code: "NIV", label: "NIV — New International Version" },
  { code: "NLT", label: "NLT — New Living Translation" },
  { code: "ESV", label: "ESV — English Standard Version" },
  { code: "NRSV", label: "NRSV — New Revised Standard" },
  { code: "NASB", label: "NASB — New American Standard" },
  { code: "NKJV", label: "NKJV — New King James Version" },
  { code: "KJV", label: "KJV — King James Version" },
  { code: "WEB", label: "WEB — World English Bible" },
] as const;

// Canonical book order (1..66) for bolls.life book IDs.
const BOOKS: { id: number; names: string[] }[] = [
  { id: 1, names: ["genesis", "gen", "ge", "gn"] },
  { id: 2, names: ["exodus", "exo", "ex"] },
  { id: 3, names: ["leviticus", "lev", "lv"] },
  { id: 4, names: ["numbers", "num", "nm", "nb"] },
  { id: 5, names: ["deuteronomy", "deut", "dt"] },
  { id: 6, names: ["joshua", "josh", "jos"] },
  { id: 7, names: ["judges", "judg", "jdg"] },
  { id: 8, names: ["ruth", "ru"] },
  { id: 9, names: ["1 samuel", "1samuel", "1 sam", "1sam", "1sa"] },
  { id: 10, names: ["2 samuel", "2samuel", "2 sam", "2sam", "2sa"] },
  { id: 11, names: ["1 kings", "1kings", "1 kgs", "1kgs", "1ki"] },
  { id: 12, names: ["2 kings", "2kings", "2 kgs", "2kgs", "2ki"] },
  { id: 13, names: ["1 chronicles", "1chronicles", "1 chr", "1chr", "1ch"] },
  { id: 14, names: ["2 chronicles", "2chronicles", "2 chr", "2chr", "2ch"] },
  { id: 15, names: ["ezra", "ezr"] },
  { id: 16, names: ["nehemiah", "neh"] },
  { id: 17, names: ["esther", "est"] },
  { id: 18, names: ["job", "jb"] },
  { id: 19, names: ["psalms", "psalm", "ps"] },
  { id: 20, names: ["proverbs", "prov", "pr"] },
  { id: 21, names: ["ecclesiastes", "eccl", "ec", "qoh"] },
  { id: 22, names: ["song of solomon", "song of songs", "song", "sos", "sng"] },
  { id: 23, names: ["isaiah", "isa", "is"] },
  { id: 24, names: ["jeremiah", "jer"] },
  { id: 25, names: ["lamentations", "lam"] },
  { id: 26, names: ["ezekiel", "ezek", "ezk"] },
  { id: 27, names: ["daniel", "dan", "dn"] },
  { id: 28, names: ["hosea", "hos"] },
  { id: 29, names: ["joel", "jl"] },
  { id: 30, names: ["amos", "am"] },
  { id: 31, names: ["obadiah", "obad", "ob"] },
  { id: 32, names: ["jonah", "jon"] },
  { id: 33, names: ["micah", "mic", "mi"] },
  { id: 34, names: ["nahum", "nah"] },
  { id: 35, names: ["habakkuk", "hab"] },
  { id: 36, names: ["zephaniah", "zeph", "zep"] },
  { id: 37, names: ["haggai", "hag"] },
  { id: 38, names: ["zechariah", "zech", "zec"] },
  { id: 39, names: ["malachi", "mal"] },
  { id: 40, names: ["matthew", "matt", "mt"] },
  { id: 41, names: ["mark", "mk", "mrk"] },
  { id: 42, names: ["luke", "lk"] },
  { id: 43, names: ["john", "jn", "jhn"] },
  { id: 44, names: ["acts", "ac"] },
  { id: 45, names: ["romans", "rom", "ro"] },
  { id: 46, names: ["1 corinthians", "1corinthians", "1 cor", "1cor", "1co"] },
  { id: 47, names: ["2 corinthians", "2corinthians", "2 cor", "2cor", "2co"] },
  { id: 48, names: ["galatians", "gal"] },
  { id: 49, names: ["ephesians", "eph"] },
  { id: 50, names: ["philippians", "phil", "php"] },
  { id: 51, names: ["colossians", "col"] },
  { id: 52, names: ["1 thessalonians", "1thessalonians", "1 thess", "1thess", "1th"] },
  { id: 53, names: ["2 thessalonians", "2thessalonians", "2 thess", "2thess", "2th"] },
  { id: 54, names: ["1 timothy", "1timothy", "1 tim", "1tim", "1ti"] },
  { id: 55, names: ["2 timothy", "2timothy", "2 tim", "2tim", "2ti"] },
  { id: 56, names: ["titus", "ti"] },
  { id: 57, names: ["philemon", "phlm", "phm"] },
  { id: 58, names: ["hebrews", "heb"] },
  { id: 59, names: ["james", "jas", "jm"] },
  { id: 60, names: ["1 peter", "1peter", "1 pet", "1pet", "1pe"] },
  { id: 61, names: ["2 peter", "2peter", "2 pet", "2pet", "2pe"] },
  { id: 62, names: ["1 john", "1john", "1 jn", "1jn"] },
  { id: 63, names: ["2 john", "2john", "2 jn", "2jn"] },
  { id: 64, names: ["3 john", "3john", "3 jn", "3jn"] },
  { id: 65, names: ["jude", "jud"] },
  { id: 66, names: ["revelation", "rev", "re"] },
];

const BOOK_LOOKUP = new Map<string, number>();
for (const b of BOOKS) for (const n of b.names) BOOK_LOOKUP.set(n, b.id);

function bookDisplayName(id: number) {
  const b = BOOKS.find((x) => x.id === id);
  if (!b) return "";
  return b.names[0].replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ParsedRef {
  bookId: number;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

/** Parse references like "John 3:16", "John 3:16-18", "1 Cor 13:4-7". */
export function parseReference(input: string): ParsedRef | null {
  const m = input.trim().match(/^(\d?\s*[A-Za-z][A-Za-z\s]*?)\s+(\d+):(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (!m) return null;
  const bookKey = m[1].toLowerCase().replace(/\s+/g, " ").trim();
  const bookId =
    BOOK_LOOKUP.get(bookKey) ?? BOOK_LOOKUP.get(bookKey.replace(/\s/g, ""));
  if (!bookId) return null;
  const chapter = Number(m[2]);
  const verseStart = Number(m[3]);
  const verseEnd = m[4] ? Number(m[4]) : verseStart;
  return { bookId, bookName: bookDisplayName(bookId), chapter, verseStart, verseEnd };
}

export interface FetchedVerse {
  verse: number;
  text: string;
}

/** Fetch verses from bolls.life. */
export async function fetchScriptureBolls(
  ref: string,
  translation: string
): Promise<{ reference: string; verses: FetchedVerse[] }> {
  const parsed = parseReference(ref);
  if (!parsed) throw new Error(`Couldn't parse "${ref}". Try e.g. "John 3:16-18".`);
  const url = `https://bolls.life/get-text/${encodeURIComponent(translation)}/${parsed.bookId}/${parsed.chapter}/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Lookup failed (${res.status}). Translation may be unavailable.`);
  const data = (await res.json()) as { verse: number; text: string }[];
  const verses = data
    .filter((v) => v.verse >= parsed.verseStart && v.verse <= parsed.verseEnd)
    .map((v) => ({ verse: v.verse, text: stripHtml(v.text) }));
  if (verses.length === 0) throw new Error("No verses found in that range.");
  const reference =
    parsed.verseStart === parsed.verseEnd
      ? `${parsed.bookName} ${parsed.chapter}:${parsed.verseStart}`
      : `${parsed.bookName} ${parsed.chapter}:${parsed.verseStart}-${parsed.verseEnd}`;
  return { reference, verses };
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
