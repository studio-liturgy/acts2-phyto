// Bible reference parsing + bolls.life API integration
// Supports:
//   "John 3:16"            single verse
//   "John 3:16-18"         range within a chapter
//   "John 3"               whole chapter
//   "John 3:21-John 4:2"   cross-chapter range (same book only)

export const TRANSLATIONS = [
  { code: "NIV", label: "NIV — New International Version" },
  { code: "NLT", label: "NLT — New Living Translation" },
  { code: "ESV", label: "ESV — English Standard Version" },
  { code: "NRSVCE", label: "NRSV — New Revised Standard" },
  { code: "NASB", label: "NASB — New American Standard" },
  { code: "NKJV", label: "NKJV — New King James Version" },
  { code: "KJV", label: "KJV — King James Version" },
] as const;

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

function lookupBook(raw: string): number | null {
  const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
  return BOOK_LOOKUP.get(key) ?? BOOK_LOOKUP.get(key.replace(/\s/g, "")) ?? null;
}

export interface ParsedRef {
  bookId: number;
  bookName: string;
  startChapter: number;
  startVerse: number; // 1 if not specified
  endChapter: number;
  endVerse: number; // 999 means "to end of chapter"
  wholeChapter: boolean;
}

const BOOK_RE = /^(\d?\s*[A-Za-z][A-Za-z\s]*?)\s+(\d+)(?::(\d+))?(?:\s*[-–]\s*(?:(\d?\s*[A-Za-z][A-Za-z\s]*?)\s+(\d+):(\d+)|(\d+):(\d+)|(\d+)))?$/;

export function parseReference(input: string): ParsedRef | null {
  const m = input.trim().match(BOOK_RE);
  if (!m) return null;
  const bookId = lookupBook(m[1]);
  if (!bookId) return null;
  const startChapter = Number(m[2]);
  const hasStartVerse = m[3] !== undefined;
  const startVerse = hasStartVerse ? Number(m[3]) : 1;

  let endChapter = startChapter;
  let endVerse = hasStartVerse ? startVerse : 999;
  let wholeChapter = !hasStartVerse;

  if (m[4]) {
    // cross-book/chapter "John 3:21 - John 4:2"
    const otherBookId = lookupBook(m[4]);
    if (!otherBookId || otherBookId !== bookId)
      return null; // only same-book ranges supported
    endChapter = Number(m[5]);
    endVerse = Number(m[6]);
    wholeChapter = false;
  } else if (m[7]) {
    // "John 3:21-4:2"
    endChapter = Number(m[7]);
    endVerse = Number(m[8]);
    wholeChapter = false;
  } else if (m[9]) {
    // "John 3:16-18"
    endVerse = Number(m[9]);
    wholeChapter = false;
  }

  return {
    bookId,
    bookName: bookDisplayName(bookId),
    startChapter,
    startVerse,
    endChapter,
    endVerse,
    wholeChapter,
  };
}

export interface FetchedVerse {
  verse: number;
  chapter: number;
  text: string;
}

async function fetchChapter(translation: string, bookId: number, chapter: number) {
  const url = `https://bolls.life/get-text/${encodeURIComponent(translation)}/${bookId}/${chapter}/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Lookup failed (${res.status}). Translation may be unavailable.`);
  return (await res.json()) as { verse: number; text: string }[];
}

export async function fetchScriptureBolls(
  ref: string,
  translation: string,
  opts: { removeLineBreaks?: boolean } = {}
): Promise<{ reference: string; verses: FetchedVerse[] }> {
  const parsed = parseReference(ref);
  if (!parsed)
    throw new Error(
      `Couldn't parse "${ref}". Try "John 3:16", "John 3", or "John 3:21-John 4:2".`
    );
  const removeLineBreaks = opts.removeLineBreaks ?? true;

  const collected: FetchedVerse[] = [];
  for (let ch = parsed.startChapter; ch <= parsed.endChapter; ch++) {
    const data = await fetchChapter(translation, parsed.bookId, ch);
    const lo = ch === parsed.startChapter ? parsed.startVerse : 1;
    const hi = ch === parsed.endChapter ? parsed.endVerse : 999;
    for (const v of data) {
      if (v.verse >= lo && v.verse <= hi) {
        collected.push({
          verse: v.verse,
          chapter: ch,
          text: cleanVerseText(v.text, { removeLineBreaks }),
        });
      }
    }
  }
  if (collected.length === 0) throw new Error("No verses found in that range.");

  let reference: string;
  if (parsed.wholeChapter) {
    reference = `${parsed.bookName} ${parsed.startChapter}`;
  } else if (parsed.startChapter === parsed.endChapter) {
    reference =
      parsed.startVerse === parsed.endVerse
        ? `${parsed.bookName} ${parsed.startChapter}:${parsed.startVerse}`
        : `${parsed.bookName} ${parsed.startChapter}:${parsed.startVerse}-${parsed.endVerse}`;
  } else {
    reference = `${parsed.bookName} ${parsed.startChapter}:${parsed.startVerse}-${parsed.endChapter}:${parsed.endVerse}`;
  }
  return { reference, verses: collected };
}

function cleanVerseText(s: string, { removeLineBreaks }: { removeLineBreaks: boolean }) {
  let out = s;
  // Strip Strong's tags + content
  out = out.replace(/<S>[^<]*<\/S>/gi, "");
  // Strip section / pericope headers (e.g. <h>Jesus Teaches Nicodemus</h>)
  out = out.replace(/<h>[^<]*<\/h>/gi, "");
  // Strip footnotes
  out = out.replace(/<f>[^<]*<\/f>/gi, "");
  // Line breaks → newline marker we control
  out = out.replace(/<br\s*\/?>/gi, removeLineBreaks ? " " : "\n");
  // Any remaining tags
  out = out.replace(/<[^>]+>/g, "");
  // Collapse whitespace (but keep newlines if preserving line breaks)
  if (removeLineBreaks) {
    out = out.replace(/\s+/g, " ");
  } else {
    out = out
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }
  return out.trim();
}
