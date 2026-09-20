/**
 * The language registry for multilingual slides (scripture versions today; songs later).
 *
 * Every language a slide can carry is defined here and nowhere else: the
 * editor columns, the presenter's language bar, the missing-language warning,
 * and the renderer all read from this list.
 *
 * Some entries are TRANSLATIONS (English, Spanish, Japanese) and some are
 * TRANSLITERATIONS of another entry (romaji is Japanese written in Latin
 * script, not a separate language). `derivedFrom` records which is which:
 * a derived line can be produced mechanically from its source, so free mode
 * generates it instead of asking for a separate translation. They are still
 * independently selectable, because showing the original above its romanised
 * form is the whole point for a congregation that reads one but not the other.
 */

export type LangCode =
  | "en"
  | "ja"
  | "ja-Hira"
  | "ja-Latn"
  | "zh-Hans"
  | "zh-Hant"
  | "zh-Latn"
  | "ko"
  | "ko-Latn"
  | "ar"
  | "id"
  | "es"
  | "pt"
  | "fr";

export interface LangDef {
  code: LangCode;
  /** Full name, used in menus, tooltips and the missing-language warning. */
  label: string;
  /** Chip text. Short enough to sit in a row of fourteen. */
  short: string;
  /** Writing direction. Only Arabic is rtl. */
  dir: "ltr" | "rtl";
  /**
   * Font families appended AFTER the template's own font stack, so a slide
   * keeps the chosen typeface for Latin text and only falls through to these
   * for characters that typeface has no glyph for. Empty for Latin-script
   * languages, which the template's stack already covers.
   */
  fontFallback: string;
  /** Set when this line is a transliteration of another entry, not a translation. */
  derivedFrom?: LangCode;
}

const JP = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', Meiryo";
const SC = "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei'";
const TC = "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei'";
const KR = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic'";
const AR = "'Noto Sans Arabic', 'Geeza Pro', 'Segoe UI'";

export const LANGS: readonly LangDef[] = [
  { code: "en", label: "English", short: "EN", dir: "ltr", fontFallback: "" },

  { code: "ja", label: "Japanese", short: "JA", dir: "ltr", fontFallback: JP },
  {
    code: "ja-Hira",
    label: "Japanese (hiragana)",
    short: "かな",
    dir: "ltr",
    fontFallback: JP,
    derivedFrom: "ja",
  },
  {
    code: "ja-Latn",
    label: "Japanese (romaji)",
    short: "Rōmaji",
    dir: "ltr",
    fontFallback: "",
    derivedFrom: "ja",
  },

  { code: "zh-Hans", label: "Chinese (simplified)", short: "CN", dir: "ltr", fontFallback: SC },
  {
    code: "zh-Hant",
    label: "Chinese (traditional)",
    short: "繁",
    dir: "ltr",
    fontFallback: TC,
    derivedFrom: "zh-Hans",
  },
  {
    code: "zh-Latn",
    label: "Chinese (pinyin)",
    short: "Pīnyīn",
    dir: "ltr",
    fontFallback: "",
    derivedFrom: "zh-Hans",
  },

  { code: "ko", label: "Korean", short: "KO", dir: "ltr", fontFallback: KR },
  {
    code: "ko-Latn",
    label: "Korean (romanized)",
    short: "Romaja",
    dir: "ltr",
    fontFallback: "",
    derivedFrom: "ko",
  },

  { code: "ar", label: "Arabic", short: "AR", dir: "rtl", fontFallback: AR },
  { code: "id", label: "Indonesian", short: "ID", dir: "ltr", fontFallback: "" },
  { code: "es", label: "Spanish", short: "ES", dir: "ltr", fontFallback: "" },
  { code: "pt", label: "Portuguese", short: "PT", dir: "ltr", fontFallback: "" },
  { code: "fr", label: "French", short: "FR", dir: "ltr", fontFallback: "" },
];

/** The languages a WORKSPACE can be set to: every real language, but not the
 *  transliterations, which only exist as a second line under their source.
 *  Chinese is one language here: both scripts count, so a congregation can
 *  mix a traditional and a simplified version. */
export const WORKSPACE_LANGS: readonly LangDef[] = LANGS.filter((l) => !l.derivedFrom);

/** The stored workspace-language code for any language code: the Chinese
 *  scripts fold into "zh-Hans" (settings saved before they were one language). */
export function workspaceLang(code: LangCode): LangCode {
  return code === "zh-Hant" || code === "zh-Latn" ? "zh-Hans" : code;
}

/** The label a workspace's language picker shows: plain "Chinese", since the
 *  script isn't a workspace choice. */
export function workspaceLangLabel(code: LangCode): string {
  return code === "zh-Hans" ? "Chinese" : langDef(code).label;
}

/** Canonical order, used to lay out the chip bar. Selection order is the user's. */
export const DEFAULT_LANG_ORDER: LangCode[] = LANGS.map((l) => l.code);

/** What a fresh install shows before anyone picks anything. */
export const DEFAULT_SELECTED_LANGS: LangCode[] = ["en"];

const BY_CODE = new Map<LangCode, LangDef>(LANGS.map((l) => [l.code, l]));

export function langDef(code: LangCode): LangDef {
  const def = BY_CODE.get(code);
  if (!def) throw new Error(`Unknown language code: ${code}`);
  return def;
}

/**
 * A stable colour per language. Related languages sit close in hue: each
 * script family shares a base hue and varies only in lightness, so Japanese
 * and its kana/rōmaji forms read as three shades of the same red, the three
 * Chinese forms as three shades of orange, and so on. Unrelated languages are
 * spread around the wheel to stay distinct. Same code always maps to the same
 * colour across the editor, home and the presenter.
 */
const LANG_HSL: Record<LangCode, string> = {
  en: "hsl(215 70% 50%)", // blue, the anchor

  ja: "hsl(358 68% 52%)", // Japanese family — red
  "ja-Hira": "hsl(358 60% 63%)",
  "ja-Latn": "hsl(358 52% 72%)",

  "zh-Hans": "hsl(26 80% 50%)", // Chinese family — orange
  "zh-Hant": "hsl(26 70% 60%)",
  "zh-Latn": "hsl(26 62% 69%)",

  ko: "hsl(286 48% 57%)", // Korean family — purple
  "ko-Latn": "hsl(286 40% 69%)",

  ar: "hsl(150 55% 40%)", // Arabic — green
  id: "hsl(188 62% 42%)", // Indonesian — teal

  es: "hsl(50 85% 47%)", // Romance trio, clustered in the golds/greens
  pt: "hsl(42 82% 45%)",
  fr: "hsl(95 45% 44%)",
};

export function langColor(code: LangCode): string {
  return LANG_HSL[code] ?? "hsl(215 70% 50%)";
}

export function isLangCode(value: unknown): value is LangCode {
  return typeof value === "string" && BY_CODE.has(value as LangCode);
}

/** Drop anything unrecognised and de-duplicate, preserving the caller's order. */
export function sanitiseLangs(value: unknown): LangCode[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<LangCode>();
  for (const v of value) if (isLangCode(v) && !seen.has(v)) seen.add(v);
  return [...seen];
}

/**
 * The font stack for one language on a slide: the template's typeface first,
 * then the script fallback so CJK and Arabic render with matched metrics
 * instead of whatever the projector machine happens to have installed.
 */
export function langFontStack(code: LangCode, templateFont?: string): string {
  const fallback = langDef(code).fontFallback;
  return [templateFont, fallback].filter(Boolean).join(", ");
}

/**
 * How a line of THIS language should break. Korean is space-separated but
 * browsers will otherwise split a word between syllables, so `keep-all` keeps
 * words whole (only spaces break). CJK without spaces must stay `normal` —
 * `keep-all` there would make the whole line unbreakable — and their line-start
 * punctuation is handled by `line-break: strict` on the slide instead.
 */
export function langWordBreak(code: LangCode): "keep-all" | "normal" {
  return code === "ko" ? "keep-all" : "normal";
}

// French sets a (narrow) non-breaking space before ; : ! ? » % and after «, so
// the punctuation/guillemet never wraps onto a line by itself.
function frenchSpacing(text: string): string {
  return text.replace(/\s*([;:!?»%])/g, " $1").replace(/«\s*/g, "« ");
}

/** Apply any per-language text convention (currently French spacing) to a line. */
export function typesetLine(code: LangCode, text: string): string {
  return code === "fr" ? frenchSpacing(text) : text;
}
