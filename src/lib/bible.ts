// Bible reference parsing + bolls.life API integration
// Supports:
//   "John 3:16"            single verse
//   "John 3:16-18"         range within a chapter
//   "John 3"               whole chapter
//   "John 3:21-John 4:2"   cross-chapter range (same book only)
import type { LangCode } from "./langs";

export const TRANSLATIONS = [
  { code: "NIV", label: "NIV — New International Version" },
  { code: "NLT", label: "NLT — New Living Translation" },
  { code: "ESV", label: "ESV — English Standard Version" },
  { code: "NRSVCE", label: "NRSV — New Revised Standard" },
  { code: "NASB", label: "NASB — New American Standard" },
  { code: "NKJV", label: "NKJV — New King James Version" },
  { code: "KJV", label: "KJV — King James Version" },
  { code: "AMP", label: "AMP — Amplified Version" },
  { code: "MSG", label: "MSG — The Message" },
] as const;

/**
 * Every translation offered on watch, grouped by language. bolls.life serves
 * all of these from the same endpoint as the English ones, so nothing about
 * fetching changes: only the code in the URL.
 *
 * English stays first and unchanged, so a scripture set built on phyto.live
 * keeps working with its stored translation code.
 */
export const TRANSLATION_GROUPS = [
  { language: "English", translations: TRANSLATIONS },
  {
    language: "Japanese",
    translations: [
      { code: "JPNICT", label: "JPNICT — Japanese Contemporary" },
      { code: "NJB", label: "NJB — New Japanese Bible" },
      { code: "JPKJV", label: "JPKJV — Japanese King James" },
    ],
  },
  {
    language: "Chinese",
    translations: [
      { code: "CUNPS", label: "CUNPS — Union (simplified)" },
      { code: "CUV", label: "CUV — Union (traditional)" },
      { code: "CUNP", label: "CUNP — Union New Punctuation" },
      { code: "PCBS", label: "PCBS — Pastoral (simplified)" },
      { code: "PCB", label: "PCB — Pastoral (traditional)" },
      { code: "ChiSB", label: "ChiSB — Studium Biblicum" },
    ],
  },
  {
    language: "Korean",
    translations: [
      { code: "KRV", label: "KRV — Korean Revised" },
      { code: "RNKSV", label: "RNKSV — New Korean Standard" },
    ],
  },
  {
    language: "Indonesian",
    translations: [{ code: "TB", label: "TB — Terjemahan Baru" }],
  },
  {
    language: "Arabic",
    translations: [
      { code: "NAV", label: "NAV — Kitab al-Hayat" },
      { code: "SVD", label: "SVD — Smith and Van Dyke" },
    ],
  },
  {
    language: "Spanish",
    translations: [
      { code: "RV1960", label: "RV1960 — Reina-Valera 1960" },
      { code: "NVI", label: "NVI — Nueva Versión Internacional" },
      { code: "NTV", label: "NTV — Nueva Traducción Viviente" },
      { code: "LBLA", label: "LBLA — La Biblia de las Américas" },
      { code: "PDT", label: "PDT — Palabra de Dios para Todos" },
    ],
  },
  {
    language: "Portuguese",
    translations: [
      { code: "NVIPT", label: "NVI-PT — Nova Versão Internacional" },
      { code: "ARA", label: "ARA — Almeida Revista e Atualizada" },
      { code: "NAA", label: "NAA — Nova Almeida Atualizada" },
      { code: "NTLH", label: "NTLH — Nova Tradução na Linguagem de Hoje" },
      { code: "NVT", label: "NVT — Nova Versão Transformadora" },
    ],
  },
  {
    language: "French",
    translations: [
      { code: "FRLSG", label: "LSG — Louis Segond" },
      { code: "BDS", label: "BDS — Bible du Semeur" },
      { code: "NBS", label: "NBS — Nouvelle Bible Segond" },
      { code: "FRPDV17", label: "PDV — Parole de Vie" },
    ],
  },
] as const;

/** Human label for a translation code, falling back to the code itself. */
export function translationLabel(code: string): string {
  for (const group of TRANSLATION_GROUPS) {
    for (const t of group.translations) if (t.code === code) return t.label;
  }
  return code;
}

// Which language a bible version is in — used so a stacked scripture line gets
// the right typography (Korean word-break, French spacing, etc.). Maps each
// TRANSLATION_GROUPS language to a representative LangCode.
const GROUP_LANG: Record<string, LangCode> = {
  English: "en",
  Japanese: "ja",
  Chinese: "zh-Hans",
  Korean: "ko",
  Indonesian: "id",
  Arabic: "ar",
  Spanish: "es",
  Portuguese: "pt",
  French: "fr",
};

// The Chinese group mixes scripts; a workspace is set to one of them, so each
// translation needs its own. Union (CUV, CUNP), Pastoral (PCB) and Studium
// Biblicum (ChiSB) are traditional; the "S" editions are simplified.
const TRADITIONAL_CHINESE = new Set(["CUV", "CUNP", "PCB", "ChiSB"]);

export function langOfTranslation(code: string): LangCode | undefined {
  if (TRADITIONAL_CHINESE.has(code)) return "zh-Hant";
  for (const group of TRANSLATION_GROUPS) {
    if (group.translations.some((t) => t.code === code)) return GROUP_LANG[group.language];
  }
  return undefined;
}

/** The translations offered for a workspace language (for the single-version
 *  picker when multi-language is off). Falls back to everything when no
 *  translation is in that language. */
export function translationsForLang(lang: LangCode): { code: string; label: string }[] {
  const all = TRANSLATION_GROUPS.flatMap((g) => [...g.translations]);
  const mine = all.filter((t) => langOfTranslation(t.code) === lang);
  return mine.length ? mine : all;
}

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

const BOOK_RE =
  /^(\d?\s*[A-Za-z][A-Za-z\s]*?)\s+(\d+)(?::(\d+))?(?:\s*[-–]\s*(?:(\d?\s*[A-Za-z][A-Za-z\s]*?)\s+(\d+):(\d+)|(\d+):(\d+)|(\d+)))?$/;

function makeRef(
  bookId: number,
  startChapter: number,
  startVerse: number | null,
  endChapter: number,
  endVerse: number,
): ParsedRef {
  const wholeChapter = startVerse === null;
  return {
    bookId,
    bookName: bookDisplayName(bookId),
    startChapter,
    startVerse: startVerse ?? 1,
    endChapter,
    endVerse,
    wholeChapter,
  };
}

export function parseReference(input: string): ParsedRef | null {
  const m = input.trim().match(BOOK_RE);
  if (!m) return null;
  const bookId = lookupBook(m[1]);
  if (!bookId) return null;
  const startChapter = Number(m[2]);
  const hasStartVerse = m[3] !== undefined;
  const startVerse = hasStartVerse ? Number(m[3]) : null;

  let endChapter = startChapter;
  let endVerse = hasStartVerse ? Number(m[3]) : 999;

  if (m[4]) {
    // cross-book/chapter "John 3:21 - John 4:2"
    const otherBookId = lookupBook(m[4]);
    if (!otherBookId || otherBookId !== bookId) return null; // only same-book ranges supported
    endChapter = Number(m[5]);
    endVerse = Number(m[6]);
  } else if (m[7]) {
    // "John 3:21-4:2"
    endChapter = Number(m[7]);
    endVerse = Number(m[8]);
  } else if (m[9]) {
    // "John 3:16-18"
    endVerse = Number(m[9]);
  }

  return makeRef(bookId, startChapter, startVerse, endChapter, endVerse);
}

// A reference typed in the translation's own language, e.g. "约翰福音 3:16" or
// "ヨハネ3:16". The book name can be any script, so this parser is looser than
// BOOK_RE and resolves the book against the get-books list of the translation(s)
// in play. Chapter/verse still use ASCII digits (bolls' own reference format).
const LOC_BOOK_RE =
  /^\s*(.+?)\s*(\d+)(?:[:：]\s*(\d+))?(?:\s*[-–—~]\s*(?:(\d+)[:：]\s*(\d+)|(\d+)))?\s*$/;

export async function parseReferenceLocalized(
  input: string,
  translations: string[],
): Promise<ParsedRef | null> {
  const m = input.trim().match(LOC_BOOK_RE);
  if (!m) return null;
  const bookId = lookupBook(m[1]) ?? (await resolveLocalizedBookId(m[1], translations));
  if (!bookId) return null;
  const startChapter = Number(m[2]);
  const hasStartVerse = m[3] !== undefined;
  const startVerse = hasStartVerse ? Number(m[3]) : null;

  let endChapter = startChapter;
  let endVerse = hasStartVerse ? Number(m[3]) : 999;
  if (m[4]) {
    // "约翰福音 3:21-4:2"
    endChapter = Number(m[4]);
    endVerse = Number(m[5]);
  } else if (m[6]) {
    // "约翰福音 3:16-18"
    endVerse = Number(m[6]);
  }

  return makeRef(bookId, startChapter, startVerse, endChapter, endVerse);
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

// bolls returns book names in each translation's own language via get-books, so
// this is how a reference shows a localized book name (e.g. "約翰福音"). Cached
// per translation — the list is fetched at most once — and falls back to the
// English display name if the request fails.
const bookNamesByTranslation = new Map<string, Map<number, string>>();

async function loadBooks(translation: string): Promise<Map<number, string>> {
  let names = bookNamesByTranslation.get(translation);
  if (!names) {
    names = new Map<number, string>();
    try {
      const res = await fetch(`https://bolls.life/get-books/${encodeURIComponent(translation)}/`);
      if (res.ok) {
        const books = (await res.json()) as { bookid?: number; name?: string }[];
        for (const b of books) {
          if (typeof b.bookid === "number" && typeof b.name === "string")
            names.set(b.bookid, b.name);
        }
      }
    } catch {
      // fall back to the English display name below
    }
    bookNamesByTranslation.set(translation, names);
  }
  return names;
}

async function localizedBookName(translation: string, bookId: number): Promise<string> {
  const names = await loadBooks(translation);
  return names.get(bookId) || bookDisplayName(bookId);
}

// Reverse of localizedBookName: find the book id for a name typed in a
// translation's own language, so a reference like "요한복음 3:16" resolves. Checks
// the given translations first (fast path — usually the one being imported), then
// one representative translation per language so a reference can be typed in ANY
// supported language even when the selected version is English.
//
// Matching ignores case and spaces and is fuzzy: a typed name that is a prefix
// of (or contained in) the translation's own name still matches, because the
// same book is spelled with small variations — bolls calls John "요한복음서" while
// people type "요한복음", "1 Corinthians" vs "고린도전서", etc. The closest match
// (exact, then a shared prefix, then any containment; ties broken by length)
// wins, so "요한복음" lands on John rather than 1/2/3 John.
async function resolveLocalizedBookId(
  bookPart: string,
  translations: string[],
): Promise<number | null> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();
  // A numeral marks a numbered book (1 John, 2 Corinthians). When the typed name
  // has none, a numbered book is the wrong answer for it — so "ヨハネ" (John)
  // must not resolve to 1 John just because that name happens to be shorter.
  const hasNum = (s: string) => /[0-9０-９一二三四五六七八九壱壹弐貳参參]/.test(s);
  const target = norm(bookPart);
  if (!target) return null;
  const tNum = hasNum(target);
  // One translation per language, plus CUNP for traditional Chinese: bolls stores
  // simplified book names for most Chinese versions (including CUV), so a
  // traditional reference like "約翰福音" only matches a genuinely traditional list.
  const representatives = [
    ...TRANSLATION_GROUPS.map((g) => g.translations[0]?.code).filter(Boolean),
    "CUNP",
  ];
  const seen = new Set<string>();
  // Rank tuple, lower is better: [numeral mismatch, match tightness, book id].
  // Book id breaks ties canonically — a bare name shared by a Gospel and a later
  // book (e.g. "ヨハネ" → John, 1–3 John, Revelation) resolves to the Gospel.
  let best: { id: number; rank: [number, number, number] } | null = null;
  const better = (a: [number, number, number], b: [number, number, number]) =>
    a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];
  for (const t of [...translations, ...representatives]) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    const names = await loadBooks(t);
    for (const [id, name] of names) {
      const a = norm(name);
      if (!a) continue;
      let score: number;
      if (a === target && hasNum(a) === tNum)
        return id; // exact, unambiguous
      else if (a === target) score = 0;
      else if (a.startsWith(target))
        score = 1; // typed is a prefix (요한복음 → 요한복음서)
      else if (target.startsWith(a)) score = 2;
      else if (a.includes(target) || target.includes(a)) score = 3;
      else continue;
      const rank: [number, number, number] = [hasNum(a) === tNum ? 0 : 1, score, id];
      if (!best || better(rank, best.rank)) best = { id, rank };
    }
  }
  return best?.id ?? null;
}

export async function fetchScriptureBolls(
  ref: string,
  translation: string,
  opts: { removeLineBreaks?: boolean; hints?: string[] } = {},
): Promise<{ reference: string; bookName: string; verses: FetchedVerse[] }> {
  // English book names parse directly; otherwise resolve the name against this
  // translation (and any hinted ones — e.g. the other version in a bilingual
  // import) so a reference can be typed in the passage's own language.
  const parsed =
    parseReference(ref) ??
    (await parseReferenceLocalized(ref, [translation, ...(opts.hints ?? [])]));
  if (!parsed)
    throw new Error(`Couldn't parse "${ref}". Try "John 3:16", "John 3", or "John 3:21-John 4:2".`);
  const removeLineBreaks = opts.removeLineBreaks ?? true;
  const bookName = await localizedBookName(translation, parsed.bookId);

  const collected: FetchedVerse[] = [];
  for (let ch = parsed.startChapter; ch <= parsed.endChapter; ch++) {
    const data = (await fetchChapter(translation, parsed.bookId, ch)) as {
      verse: number;
      text: string;
      pericope?: unknown;
      comment?: unknown;
    }[];
    const lo = ch === parsed.startChapter ? parsed.startVerse : 1;
    const hi = ch === parsed.endChapter ? parsed.endVerse : 999;
    for (const v of data) {
      // Skip non-verse entries (e.g. pericope-only rows that some bolls
      // translations include with verse === 0 or empty text).
      if (!v || typeof v.verse !== "number" || v.verse <= 0) continue;
      const text = cleanVerseText(v.text ?? "", {
        removeLineBreaks,
        // Psalm superscriptions ("For the director of music…") ride along in
        // verse 1 of a psalm; the reader doesn't want them on a slide.
        superscription: parsed.bookId === 19 && v.verse === 1,
      });
      if (!text) continue;
      if (v.verse >= lo && v.verse <= hi) {
        collected.push({ verse: v.verse, chapter: ch, text });
      }
    }
  }
  if (collected.length === 0) throw new Error("No verses found in that range.");

  let reference: string;
  if (parsed.wholeChapter) {
    reference = `${bookName} ${parsed.startChapter}`;
  } else if (parsed.startChapter === parsed.endChapter) {
    reference =
      parsed.startVerse === parsed.endVerse
        ? `${bookName} ${parsed.startChapter}:${parsed.startVerse}`
        : `${bookName} ${parsed.startChapter}:${parsed.startVerse}-${parsed.endVerse}`;
  } else {
    reference = `${bookName} ${parsed.startChapter}:${parsed.startVerse}-${parsed.endChapter}:${parsed.endVerse}`;
  }
  return { reference, bookName: bookName, verses: collected };
}

// Strip HTML tags robustly by repeating until the string stops changing. A
// single `replace(/<[^>]+>/g, "")` pass can leave a tag behind on overlapping
// input (e.g. "<a<b>c>" → "c>"), so loop to a fixpoint.
function stripTags(s: string): string {
  let prev: string;
  do {
    prev = s;
    s = s.replace(/<[^>]+>/g, "");
  } while (s !== prev);
  return s;
}

/** An English psalm superscription: the musical/authorship note that precedes
 *  the words of many psalms ("For the director of music. Of David. A psalm."),
 *  and the "Psalm N" title some translations prepend. */
const SUPERSCRIPTION =
  /^(book\s+(?:[ivx]+|\d+)\b|psalms?\s+\d+\b|for the (director|choir|leader|chief)\b|to the chief musician\b|a (psalm|song|prayer|maskil|maschil|miktam|michtam|shiggaion|contemplation|petition)\b|an? (psalm|song|prayer)\b|of (david|asaph|solomon|moses|heman|ethan|the sons of korah|jeduthun)\b|a song of ascents\b|according to\b)/i;

/** Opening/closing bracket pairs used for superscriptions in CJK editions. */
const CJK_BRACKETS: [string, string][] = [
  ["〔", "〕"],
  ["［", "］"],
  ["【", "】"],
  ["（", "）"],
];

export function cleanVerseText(
  s: string,
  {
    removeLineBreaks,
    superscription = false,
  }: { removeLineBreaks: boolean; superscription?: boolean },
) {
  let out = s;

  // Superscripts are never verse text: footnote markers, and in JPKJV the
  // furigana reading after every kanji (<i>第</i><sup>,だい</sup>), which
  // stripTags would otherwise leave inline as garbage.
  out = out.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "");
  // Centred paragraphs are headings (PDT: book division, pericope title, the
  // psalm's note), set apart from the verse that follows them.
  out = out.replace(/<p\b[^>]*align=['"]center['"][^>]*>[\s\S]*?<\/p>/gi, "");

  if (superscription) {
    // Inline book division + title, no break before the words: NTV "LIBRO
    // PRIMERO (Salmos 1–41) Salmo 1 Qué alegría…", and the Japanese "第一巻".
    out = out.replace(/^\s*(?:LIBRO|LIVRO|LIVRE)\s+[^()<]*\([^)]*\)\s*/i, "");
    out = out.replace(/^\s*(?:Salmos?|Psaume|Psalm)\s+\d+\s+(?=[^\d<])/i, "");
    // (JPKJV wraps each kanji in <i>…</i>, so allow tags between them.)
    out = out.replace(
      /^\s*(?:<i>)?第(?:<\/i>)?\s*(?:<i>)?[一二三四五1-5](?:<\/i>)?\s*(?:<i>)?巻(?:<\/i>)?\s*/,
      "",
    );
    // NKJV-style: the note in italics ahead of the verse.
    out = out.replace(/^\s*<i>([\s\S]*?)<\/i>(\s*<\/i>)?\s*/i, (m, inner: string) =>
      SUPERSCRIPTION.test(stripTags(inner).trim()) ? "" : m,
    );
    // CJK editions: the note in fullwidth brackets, with or without a <br/>
    // after it (CUNPS/JPNICT break, CUV runs on inline). Only at the very
    // start of verse 1 of a psalm, so a verse that is itself parenthetical is
    // never touched.
    for (const [open, close] of CJK_BRACKETS) {
      if (out.trimStart().startsWith(open)) {
        const end = out.indexOf(close);
        if (end > 0) out = out.slice(end + close.length).replace(/^\s*(<br\s*\/?>)?\s*/i, "");
        break;
      }
    }
    // NIV-style: "BOOK I<br/>Psalms 1–41<br/>Psalm 1<br/>For the director of
    // music…<br/>verse". Drop leading <br/>-separated segments while they read
    // as a book division, a title or a superscription.
    for (let guard = 0; guard < 6; guard++) {
      const brIdx = out.search(/<br\s*\/?>/i);
      if (brIdx <= 0) break;
      const head = stripTags(out.slice(0, brIdx)).trim();
      if (!SUPERSCRIPTION.test(head)) break;
      out = out.slice(brIdx).replace(/^<br\s*\/?>/i, "");
    }
  }

  // Strip paired tags that contain non-verse metadata (header, pericope,
  // footnotes, Strong's numbers, translator notes, paragraph breaks, etc.)
  // including any nested attributes.
  const stripPaired = (tag: string) =>
    (out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), ""));
  ["S", "h", "f", "pb", "n", "e", "t"].forEach(stripPaired);
  // Self-closing variants (excluding <br/>, handled below)
  out = out.replace(/<(?:pb|n|e)\b[^>]*\/>/gi, "");

  // Bolls embeds pericope titles inline at the start of the verse that
  // follows them, separated by <br/>. Detect a leading heading-like fragment
  // (no terminal sentence punctuation, mostly title-case words) and drop it.
  const brIdx = out.search(/<br\s*\/?>/i);
  if (brIdx > 0) {
    const head = stripTags(out.slice(0, brIdx)).trim();
    const headIsTitle =
      head.length > 0 &&
      head.length < 120 &&
      !/[.!?;:]\s*["'\u201D\u2019)]?$/.test(head) &&
      // mostly capitalised words OR all caps
      (/^[A-Z0-9][^a-z\n]*$/.test(head) ||
        head.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).length >=
          Math.ceil(head.split(/\s+/).length * 0.6));
    if (headIsTitle) {
      out = out.slice(brIdx).replace(/^<br\s*\/?>/i, "");
    }
  }

  // <br> → controlled newline marker
  out = out.replace(/<br\s*\/?>/gi, removeLineBreaks ? " " : "\n");
  // Strip any remaining tags but keep their inner text (e.g. <i>added</i>)
  out = stripTags(out);
  // Drop markdown-style bold headers a few translations smuggle in
  out = out.replace(/^\s*\*\*[^*\n]+\*\*\s*/g, "");
  // Some CJK editions (CUV) put a space between every character. Browsers
  // then break at any of them, stranding a 。 or 」 at the start of a line;
  // without the spaces the text wraps under CJK line-breaking rules. Only
  // between Han/kana characters and CJK punctuation: Korean spaces words and
  // keeps them.
  out = out.replace(
    /(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef])[ \t]+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef])/gu,
    "",
  );
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

/** One verse as it reads in each of the stacked translations. */
export interface AlignedVerse {
  chapter: number;
  verse: number;
  byVersion: Record<string, string>;
}

/**
 * Line two translations up verse by verse.
 *
 * Verse number is the join key, which is right nearly always and known to be
 * imperfect: translations occasionally merge two verses into one or move a
 * clause across a boundary, so a verse present in one may be absent or shifted
 * in the other. Rather than guess, a verse with no counterpart simply has no
 * second line, and `unmatched` counts them so the editor can say so instead of
 * letting it surface mid-service.
 *
 * The primary translation drives the set of verses: it decides what gets a
 * slide, and the secondary fills in where it can.
 */
export function alignVerses(
  primary: { code: string; verses: FetchedVerse[] },
  secondary?: { code: string; verses: FetchedVerse[] } | null,
): { rows: AlignedVerse[]; unmatched: number } {
  const lookup = new Map<string, string>();
  for (const v of secondary?.verses ?? []) lookup.set(`${v.chapter}:${v.verse}`, v.text);

  let unmatched = 0;
  const rows = primary.verses.map((v) => {
    const byVersion: Record<string, string> = { [primary.code]: v.text };
    if (secondary) {
      const other = lookup.get(`${v.chapter}:${v.verse}`);
      if (other) byVersion[secondary.code] = other;
      else unmatched += 1;
    }
    return { chapter: v.chapter, verse: v.verse, byVersion };
  });

  return { rows, unmatched };
}
