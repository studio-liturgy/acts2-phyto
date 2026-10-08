// Bible reference parsing and lookup. A passage's text comes from YouVersion
// (lib/youversion.ts) for every version it has, and from bolls.life only for
// the versions it doesn't.
// Supports:
//   "John 3:16"            single verse
//   "John 3:16-18"         range within a chapter
//   "John 3"               whole chapter
//   "John 3:21-John 4:2"   cross-chapter range (same book only)
import {
  langCodeForTag,
  langDef,
  toLangCode,
  workspaceLang,
  workspaceLangLabel,
  type LangCode,
} from "./langs";
import {
  fetchYvBookNames,
  fetchYvChapter,
  YV_BIBLES,
  yvLanguageName,
  yvNamesLoaded,
  yvTitles,
} from "./youversion";

/** A YouVersion Bible's version key, as sets store it ("yv:111"). A bolls.life
 *  version's key is its bolls code ("ESV"). */
export function yvKey(id: number): string {
  return `yv:${id}`;
}

/**
 * bolls.life codes phyto offered before YouVersion whose edition YouVersion
 * has too. A set that carries one keeps it, and is fetched from YouVersion.
 * (bolls now answers the four Biblica translations, NIV, NVI, NVI-PT and NAV,
 * with a notice instead of their text.)
 */
const BOLLS_ON_YOUVERSION: Record<string, number> = {
  NIV: 111,
  NASB: 100, // 1995
  AMP: 1588,
  LBLA: 89,
  NVI: 128,
  NVIPT: 129,
  BDS: 21,
  FRLSG: 93,
  NAV: 101,
};

/** The versions only bolls.life has, in the order phyto always listed them,
 *  with the language tag YouVersion would give them. */
const BOLLS_ONLY: { code: string; abbr?: string; title: string; tag: string }[] = [
  { code: "NLT", title: "New Living Translation", tag: "en" },
  { code: "ESV", title: "English Standard Version", tag: "en" },
  { code: "NRSVCE", title: "New Revised Standard", tag: "en" },
  { code: "NKJV", title: "New King James Version", tag: "en" },
  { code: "KJV", title: "King James Version", tag: "en" },
  { code: "MSG", title: "The Message", tag: "en" },
  { code: "JPNICT", title: "新共同訳 (New Interconfessional)", tag: "ja" },
  { code: "NJB", title: "新改訳 (New Japanese Bible)", tag: "ja" },
  { code: "JPKJV", title: "Japanese King James", tag: "ja" },
  { code: "CUNPS", title: "和合本 Union (simplified)", tag: "zh" },
  { code: "PCBS", title: "思高 Pastoral (simplified)", tag: "zh" },
  { code: "CUV", title: "和合本 Union (traditional)", tag: "zh-Hant-TW" },
  { code: "CUNP", title: "和合本 Union New Punctuation", tag: "zh-Hant-TW" },
  { code: "PCB", title: "思高 Pastoral (traditional)", tag: "zh-Hant-TW" },
  { code: "ChiSB", title: "Studium Biblicum", tag: "zh-Hant-TW" },
  { code: "KRV", title: "개역한글 Korean Revised", tag: "ko" },
  { code: "RNKSV", title: "새번역 New Korean Standard", tag: "ko" },
  { code: "TB", title: "Terjemahan Baru", tag: "id" },
  { code: "SVD", title: "Smith and Van Dyke", tag: "ar" },
  { code: "RV1960", title: "Reina-Valera 1960", tag: "es" },
  { code: "NTV", title: "Nueva Traducción Viviente", tag: "es" },
  { code: "PDT", title: "Palabra de Dios para Todos", tag: "es" },
  { code: "ARA", title: "Almeida Revista e Atualizada", tag: "pt" },
  { code: "NAA", title: "Nova Almeida Atualizada", tag: "pt" },
  { code: "NTLH", title: "Nova Tradução na Linguagem de Hoje", tag: "pt" },
  { code: "NVT", title: "Nova Versão Transformadora", tag: "pt" },
  { code: "NBS", title: "Nouvelle Bible Segond", tag: "fr" },
  { code: "FRPDV17", title: "Parole de Vie", tag: "fr" },
  { code: "S00", abbr: "SCH2000", title: "Schlachter 2000", tag: "de" },
];

export interface VersionInfo {
  key: string;
  /** What pickers, reference labels and set names show ("NIV"). */
  abbr: string;
  /** Its name in its own language. A YouVersion Bible's is "" until
   *  loadYvNames has run (the pickers load it). */
  title: string;
  /** BCP 47 language tag ("en", "zh-Hant-TW"). */
  tag: string;
  /** The YouVersion Bible it's read from; absent for a bolls.life version. */
  yvId?: number;
}

const BY_KEY = new Map<string, VersionInfo>();
for (const b of YV_BIBLES) {
  BY_KEY.set(yvKey(b.id), { key: yvKey(b.id), abbr: b.abbr, title: "", tag: b.tag, yvId: b.id });
}
for (const v of BOLLS_ONLY) {
  BY_KEY.set(v.code, { key: v.code, abbr: v.abbr ?? v.code, title: v.title, tag: v.tag });
}

/** The key a version is offered and fetched under: a bolls code YouVersion
 *  took over is its YouVersion key ("NIV" -> "yv:111"). */
export function canonicalVersion(key: string): string {
  const id = BOLLS_ON_YOUVERSION[key];
  return id ? yvKey(id) : key;
}

/** The YouVersion Bible a version key reads from, if any. */
export function yvIdOf(key: string): number | undefined {
  const m = /^yv:(\d+)$/.exec(canonicalVersion(key));
  return m ? Number(m[1]) : undefined;
}

export function versionInfo(key: string): VersionInfo | undefined {
  const v = BY_KEY.get(canonicalVersion(key));
  if (v?.yvId === undefined) return v;
  return { ...v, title: yvTitles(v.yvId)?.title ?? "" };
}

/** "NIV": a version as people see it. Falls back to the key itself. */
export function versionAbbr(key: string): string {
  return versionInfo(key)?.abbr ?? key;
}

// A picker lists phyto's languages first, in this order; then widely spoken
// languages; then every other language. The last two go by English name, so a
// German version isn't buried among the A-Z of smaller languages.
const LEADING_TAGS = ["en", "ja", "zh", "zh-Hant-TW", "ko", "id", "ar", "es", "pt", "fr"];
// By base language, so a variant ("hi-Latn", "ur-Deva") sits with it.
// prettier-ignore
const COMMON_LANGUAGES = new Set([
  "af", "ak", "am", "bg", "bn", "ceb", "cs", "da", "de", "ee", "el", "et", "fa", "fi", "fil",
  "gu", "ha", "he", "hi", "hr", "ht", "hu", "hy", "ig", "it", "ka", "kn", "lg", "lt", "lv",
  "mg", "ml", "mr", "my", "nb", "ne", "nl", "ny", "pa", "pl", "ro", "ru", "sk", "sl", "sn",
  "sq", "sr", "sv", "sw", "ta", "te", "th", "tl", "tr", "uk", "ur", "vi", "xh", "yo", "zu",
]);
// Within a language, the versions phyto offered before YouVersion lead, in
// their old order.
const LEGACY_ORDER = ["NIV", "NASB", "AMP", "LBLA", "NVI", "NVIPT", "FRLSG", "BDS", "NAV"].map(
  (c) => BOLLS_ON_YOUVERSION[c],
);

/** The language a tag names, as a picker heading: phyto's own label for a
 *  language it has an entry for ("Chinese (traditional)"), else YouVersion's
 *  English name ("Spanish (Spain)", "Kaqchikel"). */
export function tagLanguageName(tag: string): string {
  const code = toLangCode(tag);
  return code ? langDef(code).label : (yvLanguageName(tag) ?? tag);
}

export type TranslationEntry = { code: string; abbr: string; label: string };
export type TranslationGroup = { language: string; translations: TranslationEntry[] };

const entry = (v: VersionInfo): TranslationEntry => ({ code: v.key, abbr: v.abbr, label: v.title });

// Built once, and again when the names arrive (titles, and the order of the
// languages after phyto's, which goes by their English names).
let groupsCache: { named: boolean; groups: TranslationGroup[] } | null = null;

/**
 * Every version, grouped by language for a picker: phyto's languages first,
 * then every other language YouVersion has a Bible in, by English name. In a
 * language, YouVersion's Bibles come first (the ones phyto offered before on
 * top), then the ones only bolls.life has.
 */
export function allTranslationGroups(): TranslationGroup[] {
  const named = yvNamesLoaded();
  if (groupsCache?.named === named) return groupsCache.groups;
  const byTag = new Map<string, VersionInfo[]>();
  for (const key of BY_KEY.keys()) {
    const v = versionInfo(key)!;
    const list = byTag.get(v.tag) ?? [];
    list.push(v);
    byTag.set(v.tag, list);
  }
  const lead = (tag: string) => {
    const i = LEADING_TAGS.indexOf(tag);
    if (i >= 0) return i;
    return COMMON_LANGUAGES.has(tag.split("-")[0]) ? LEADING_TAGS.length : LEADING_TAGS.length + 1;
  };
  const tags = [...byTag.keys()].sort(
    (a, b) => lead(a) - lead(b) || tagLanguageName(a).localeCompare(tagLanguageName(b), "en"),
  );
  const rank = (v: VersionInfo) => {
    if (v.yvId === undefined) return 2000 + BOLLS_ONLY.findIndex((b) => b.code === v.key);
    const legacy = LEGACY_ORDER.indexOf(v.yvId);
    return legacy < 0 ? 1000 : legacy;
  };
  const groups = tags.map((tag) => ({
    language: tagLanguageName(tag),
    translations: byTag
      .get(tag)!
      .sort((a, b) => rank(a) - rank(b) || a.abbr.localeCompare(b.abbr, "en"))
      .map(entry),
  }));
  groupsCache = { named, groups };
  return groups;
}

/** The groups narrowed to what `query` matches: a version's abbreviation or
 *  title (in its language or English), or its group's language ("korean"
 *  lists every Korean version). Empty groups drop out. Case- and
 *  accent-insensitive. */
export function searchTranslationGroups(
  groups: TranslationGroup[],
  query: string,
): TranslationGroup[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const q = fold(query.trim());
  if (!q) return groups;
  const matches = (t: TranslationEntry) => {
    const yv = yvIdOf(t.code);
    const english = yv ? (yvTitles(yv)?.english ?? "") : "";
    return [t.abbr, t.label, english].some((s) => fold(s).includes(q));
  };
  return groups
    .map((g) =>
      fold(g.language).includes(q) ? g : { ...g, translations: g.translations.filter(matches) },
    )
    .filter((g) => g.translations.length > 0);
}

/** A picker row for a version key. */
export function translationEntry(key: string): TranslationEntry {
  const v = versionInfo(key);
  return v ? entry(v) : { code: key, abbr: key, label: key };
}

// Every abbreviation a reference label or set name may end in, to the version
// it names: bolls codes first (every label written before YouVersion carries
// one), then YouVersion's abbreviations, the first Bible in picker order
// winning a shared one.
const KEY_BY_ABBR = new Map<string, string>();
for (const code of Object.keys(BOLLS_ON_YOUVERSION)) KEY_BY_ABBR.set(code, canonicalVersion(code));
for (const v of BOLLS_ONLY) {
  KEY_BY_ABBR.set(v.code, v.code);
  if (v.abbr) KEY_BY_ABBR.set(v.abbr, v.code);
}
for (const b of YV_BIBLES) if (!KEY_BY_ABBR.has(b.abbr)) KEY_BY_ABBR.set(b.abbr, yvKey(b.id));

/** The version an abbreviation names, if any. */
export function versionForAbbr(abbr: string): string | undefined {
  return KEY_BY_ABBR.get(abbr);
}

/** "Psalms 100:4 NIV" -> { ref: "Psalms 100:4", code: "yv:111" }: the label an
 *  import writes puts the version's abbreviation after the reference. An
 *  abbreviation may be several words ("ت ع م"); it only counts after a
 *  chapter or verse number. */
export function splitRefLabel(label: string): { ref: string; code?: string } {
  const s = label.trim();
  const gaps = [...s.matchAll(/\s+/g)];
  for (let n = 1; n <= 3 && n <= gaps.length; n++) {
    const gap = gaps[gaps.length - n];
    const code = KEY_BY_ABBR.get(s.slice(gap.index + gap[0].length));
    const ref = s.slice(0, gap.index);
    if (code && /\p{Nd}$/u.test(ref)) return { ref, code };
  }
  return { ref: s };
}

/** `ref` labelled with `code`'s abbreviation ("John 3:16 NIV") when `on`,
 *  else bare; any abbreviation already on it is replaced or dropped. */
export function withVersionCode(ref: string, code: string, on: boolean): string {
  const bare = splitRefLabel(ref).ref;
  return on && bare && code ? `${bare} ${versionAbbr(code)}` : bare;
}

/** The workspace language a version is in (Chinese for either script);
 *  undefined for a language phyto has no entry for. */
export function langOfTranslation(code: string): LangCode | undefined {
  const l = scriptOfTranslation(code);
  return l ? workspaceLang(l) : undefined;
}

/** The language to typeset a version in: as langOfTranslation, except
 *  traditional Chinese keeps its own script (font, glyphs). */
export function scriptOfTranslation(code: string): LangCode | undefined {
  const tag = versionInfo(code)?.tag;
  return tag ? langCodeForTag(tag) : undefined;
}

/** A version's BCP 47 language tag, for a `lang` attribute. */
export function versionLangTag(code: string): string | undefined {
  return versionInfo(code)?.tag;
}

/** The name of the language a version is in ("Korean", "Kaqchikel"). */
export function versionLanguageName(code: string): string | undefined {
  const l = langOfTranslation(code);
  if (l) return workspaceLangLabel(l);
  const tag = versionInfo(code)?.tag;
  return tag ? (yvLanguageName(tag) ?? tag) : undefined;
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

// A reference typed in the version's own language, e.g. "约翰福音 3:16" or
// "ヨハネ3:16". The book name can be any script, so this parser is looser than
// BOOK_RE and resolves the book against the book names of the version(s) in
// play. Chapter/verse still use ASCII digits.
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
// this is how a bolls reference shows a localized book name (e.g. "約翰福音").
// Cached per translation — the list is fetched at most once — and falls back to
// the English display name if the request fails.
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

/** A version's book names by book id: `names` match loosely, `abbrs` ("창")
 *  only exactly. A YouVersion Bible's come from YouVersion, a bolls one's
 *  from bolls. */
async function bookNameLists(
  translation: string,
): Promise<{ names: Map<number, string[]>; abbrs: Map<number, string[]> }> {
  const yv = yvIdOf(translation);
  if (yv !== undefined) return fetchYvBookNames(yv);
  const names = new Map<number, string[]>();
  for (const [id, name] of await loadBooks(translation)) names.set(id, [name]);
  return { names, abbrs: new Map() };
}

// One bolls translation per language, checked after the versions in play so a
// reference can be typed in ANY of phyto's languages even when the selected
// version is English: cheap lists (a few KB each), where a YouVersion Bible's
// book list carries its whole verse index. CUNP for traditional Chinese, since
// bolls stores simplified book names for most Chinese versions (including CUV).
const NAME_REPRESENTATIVES = [
  "JPNICT",
  "CUNPS",
  "CUNP",
  "KRV",
  "TB",
  "SVD",
  "RV1960",
  "ARA",
  "FRLSG",
];

// Reverse of the localized book name: find the book id for a name typed in a
// version's own language, so a reference like "요한복음 3:16" resolves. Checks
// the given versions first (usually the one being imported), then the
// representatives above.
//
// Matching ignores case and spaces and is fuzzy: a typed name that is a prefix
// of (or contained in) the version's own name still matches, because the same
// book is spelled with small variations — bolls calls John "요한복음서" while
// people type "요한복음", "1 Corinthians" vs "고린도전서", etc. The closest match
// (exact, then a shared prefix, then any containment; ties broken by length)
// wins, so "요한복음" lands on John rather than 1/2/3 John. A short form ("요")
// only counts when typed exactly.
async function resolveLocalizedBookId(
  bookPart: string,
  translations: string[],
): Promise<number | null> {
  // The same normalisation the name index is built with.
  const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, "");
  // A numeral marks a numbered book (1 John, 2 Corinthians). When the typed name
  // has none, a numbered book is the wrong answer for it — so "ヨハネ" (John)
  // must not resolve to 1 John just because that name happens to be shorter.
  const hasNum = (s: string) => /[0-9０-９一二三四五六七八九壱壹弐貳参參]/.test(s);
  const target = norm(bookPart);
  if (!target) return null;
  const tNum = hasNum(target);
  const seen = new Set<string>();
  // Rank tuple, lower is better: [numeral mismatch, match tightness, book id].
  // Book id breaks ties canonically — a bare name shared by a Gospel and a later
  // book (e.g. "ヨハネ" → John, 1–3 John, Revelation) resolves to the Gospel.
  // (Written from inside scan, so held in an object TypeScript can't narrow.)
  const found: { best: { id: number; rank: [number, number, number] } | null } = { best: null };
  const better = (a: [number, number, number], b: [number, number, number]) =>
    a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];
  const scan = async (t: string) => {
    if (!t || seen.has(t)) return null;
    seen.add(t);
    const { names, abbrs } = await bookNameLists(t);
    for (const [id, short] of abbrs) {
      if (short.some((a) => norm(a) === target)) {
        const rank: [number, number, number] = [0, 0, id];
        if (!found.best || better(rank, found.best.rank)) found.best = { id, rank };
      }
    }
    for (const [id, list] of names) {
      for (const name of list) {
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
        if (!found.best || better(rank, found.best.rank)) found.best = { id, rank };
      }
    }
    return null;
  };
  // The versions in play first (the one being fetched, and the one the
  // passage was imported in), then an exact name from any YouVersion Bible in
  // any language ("Yoni" is John in Agarabi), then the representatives.
  for (const t of translations.map(canonicalVersion)) {
    const exact = await scan(t);
    if (exact) return exact;
  }
  const anywhere = (await loadBookNameIndex())[target];
  if (anywhere) return anywhere;
  for (const t of NAME_REPRESENTATIVES) {
    const exact = await scan(t);
    if (exact) return exact;
  }
  return found.best?.id ?? null;
}

let bookNameIndex: Promise<Record<string, number>> | null = null;

/** Every YouVersion Bible's book names (normalised: lower case, no spaces)
 *  to the book id, from the catalog snapshot. ~1 MB, so only loaded when a
 *  reference doesn't parse in English. */
function loadBookNameIndex(): Promise<Record<string, number>> {
  bookNameIndex ??= import("./youversion-book-names.json").then(
    (m) => (m.default as unknown as { names: Record<string, number> }).names,
  );
  return bookNameIndex;
}

/**
 * A passage in one version: its verses, and its reference with the book named
 * in the version's own language. A YouVersion Bible (or a bolls code it took
 * over) is read from YouVersion, anything else from bolls.life.
 */
export async function fetchScripture(
  ref: string,
  translation: string,
  opts: { removeLineBreaks?: boolean; hints?: string[] } = {},
): Promise<{ reference: string; bookName: string; verses: FetchedVerse[] }> {
  // English book names parse directly; otherwise resolve the name against this
  // version (and any hinted ones — e.g. the other version in a bilingual
  // import) so a reference can be typed in the passage's own language.
  const parsed =
    parseReference(ref) ??
    (await parseReferenceLocalized(ref, [translation, ...(opts.hints ?? [])]));
  if (!parsed)
    throw new Error(`Couldn't parse "${ref}". Try "John 3:16", "John 3", or "John 3:21-John 4:2".`);
  const removeLineBreaks = opts.removeLineBreaks ?? true;
  const yv = yvIdOf(translation);

  const collected: FetchedVerse[] = [];
  let bookName = "";
  for (let ch = parsed.startChapter; ch <= parsed.endChapter; ch++) {
    const lo = ch === parsed.startChapter ? parsed.startVerse : 1;
    const hi = ch === parsed.endChapter ? parsed.endVerse : 999;
    if (yv !== undefined) {
      const chapter = await fetchYvChapter(yv, parsed.bookId, ch, !removeLineBreaks);
      bookName ||= chapter.bookName;
      for (const v of chapter.verses) {
        // A merged verse ("6-7") is in range when any of it is.
        if (v.verse <= hi && (v.endVerse ?? v.verse) >= lo)
          collected.push({ verse: v.verse, chapter: ch, text: v.text });
      }
      continue;
    }
    const data = (await fetchChapter(translation, parsed.bookId, ch)) as {
      verse: number;
      text: string;
      pericope?: unknown;
      comment?: unknown;
    }[];
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
  if (yv === undefined) bookName = (await loadBooks(translation)).get(parsed.bookId) ?? "";
  bookName ||= bookDisplayName(parsed.bookId);

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
