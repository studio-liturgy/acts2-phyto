import { isChordToken, stripChordsRaw } from "./chords.ts";

// Clean-up pass for the bundled song library (public/songs-en.json). The
// OpenSong source is community-typed chord charts, and a lot of what a band
// reads off a chart ("x2", "> chorus", "Intro C F", "Verse 1" typed as a line)
// ends up projected as if it were sung. Run by scripts/build-songs.mjs after it
// parses the source, and by scripts/clean-songs.ts over the committed JSON.
//
// His rules (Nov 19): repeat counts and directions are removed (not expanded);
// chords typed as plain letters on a sung line become real chords; section
// names typed as a lyric line become real sections; echo/backing-vocal
// brackets ("(at the cross)") stay; a whole verse typed on one line is split
// back into its lines; two lines glued together ("meNone") get a line break.

const SECTION_RE = /^\s*\[[^\]]*\]\s*$/;

/** The words a line shows, with chord tokens removed. */
const shown = (line: string) => stripChordsRaw(line);

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/** Typewriter apostrophes, odd spaces and ligatures, normalised. */
export function normaliseChars(text: string): string {
  return (
    text
      .replace(/[´ʼ′\u0092]/g, "'")
      .replace(/[\u2005\u205f\u00a0]/g, " ")
      .replace(/\u200d/g, "")
      .replace(/ı/g, "i")
      .replace(/ﬁ/g, "fi")
      .replace(/ﬂ/g, "fl")
      // Some hymns mark a line break inside a run-on verse with "\"; the verse
      // splitter re-cuts the whole verse, so it only needs to be a space.
      .replace(/\s*\\\s*/g, " ")
  );
}

// ---------------------------------------------------------------------------
// Directions and repeat counts (removed)
// ---------------------------------------------------------------------------

const COUNT = String.raw`(?:x\s?\d+|\d+\s?x|×\s?\d+|\d+\s?×)`;
// Words that only ever describe what the band does, never what is sung.
const SECTION_WORD = String.raw`(?:verses?|v\d|chorus(?:es)?|choru|refrain|bridge|pre[\s-]?chorus|post[\s-]?chorus|tag|coda|interlude|intro|outro|ending|instrumental|vamp|stanza)`;
const DIRECTION_WORD = String.raw`(?:repeat\w*|rep|rpt|back to|go to|to\s+${SECTION_WORD}|twice|three times|\d+\s*times?|(?:1st|2nd|3rd|first|second|third|last)\s+time|last \d+ lines|end|ad ?lib|as desired|as much as you want|transpose|key change|capo|let ring|keyboard|drums|speed up|no chords|quietly|spontaneous|riff|stay on|play|these two lines|ta to repeat|${COUNT}|x)`;

// A bracketed aside that is a direction: "(2x)", "[Repeat 4x]", "(back to
// verse)", "[To Bridge]", "(Chorus)", "(repeat chorus 2x Transpose to G)".
// An echo like "(at the cross)" doesn't start with a direction word, so stays.
const BRACKET_DIRECTION_RE = new RegExp(
  String.raw`\s*[\[({]\s*(?:${DIRECTION_WORD}|${SECTION_WORD})\b[^\])}]*[\])}]`,
  "gi",
);
// The same left unclosed at the end of a line: "[x2", "[Repeat".
const UNCLOSED_DIRECTION_RE = new RegExp(
  String.raw`\s*[\[({]\s*(?:repeat\w*|${COUNT})[^\])}]*$`,
  "i",
);
// A cue for who sings, not words: "(echo)", "(ladies echo)", "(men)".
const CUE_RE =
  /\s*\(\s*(?:(?:ladies|men|women|girls|guys|all|leader|people|congregation|choir)\s*)?(?:echo|only)?\s*\)|\s*\(\s*(?:ladies|men|women|girls|guys|leader|congregation|choir)\s*\)/gi;
// A trailing direction after an arrow: "x3 > chorus", "→ pre chorus & chorus".
const ARROW_RE = /\s*(?:->|>|→)\s*\S.*$/;
// A bare repeat count anywhere on the line.
const COUNT_RE = new RegExp(String.raw`(^|\s|\))${COUNT}(?=$|\s)`, "gi");
// "//" repeat bars and leftover braces.
const BAR_RE = /(^|\s|\))\/{2,}(?=$|\s)|[{}]|\[\s*\]/g;

/** A line that, once chords are gone, is only a direction: drop it. */
const DIRECTION_LINE_RE = new RegExp(
  String.raw`^(?:\d+\s+)?(?:repeat|rpt)\b(?:\s*(?:the|${SECTION_WORD}|\d+|[ivx]+|&|and|${DIRECTION_WORD}|solemn|majestic|times?|all|from|top|beginning))*\s*$` +
    String.raw`|^(?:back to|go to|to)\s+(?:the\s+)?${SECTION_WORD}(?:\s+\d+)?\s*$` +
    String.raw`|^(?:\d+\s+)?${SECTION_WORD}\s+(?:\d+\s+)?repeat\s*$`,
  "i",
);

/** Removes repeat counts, arrows, bars and bracketed directions from a line. */
export function stripDirections(line: string): string {
  let out = line;
  // Directions can carry a chord spliced inside them ("(r(D)epeat)",
  // "→Choru(Am)s"); test on the shown text, then cut the raw line at the
  // same place.
  const arrowAt = shown(out).search(ARROW_RE);
  if (arrowAt >= 0) out = cutAtShown(out, arrowAt);
  let prev;
  do {
    prev = out;
    out = out.replace(BRACKET_DIRECTION_RE, " ").replace(UNCLOSED_DIRECTION_RE, "");
  } while (out !== prev);
  out = out
    .replace(CUE_RE, "")
    .replace(BAR_RE, "$1 ")
    .replace(/\s*\(\s*\d\s*\)/g, "")
    .replace(COUNT_RE, "$1")
    .replace(/\s+repeat\s+(?:\d+\s+times?|twice)\s*$/i, "");
  out = out.replace(/ {2,}/g, " ").trim();
  // A bar removed after a leading chord leaves it standing apart from its word.
  return out === line.trim() ? out : out.replace(/^((?:\([^()\s]+\))+) (?=[A-Za-z'])/, "$1");
}

/** The raw line up to the point where its shown text reaches `index`. */
function cutAtShown(line: string, index: number): string {
  let seen = 0;
  let i = 0;
  while (i < line.length && seen < index) {
    if (line[i] === "(") {
      const close = line.indexOf(")", i + 1);
      if (close > i && isChordToken(line.slice(i + 1, close))) {
        i = close + 1;
        continue;
      }
    }
    seen++;
    i++;
  }
  return line.slice(0, i);
}

// ---------------------------------------------------------------------------
// Section labels typed as a lyric line (become real sections)
// ---------------------------------------------------------------------------

const WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
};
const LABEL_LINE_RE =
  /^(?:\d+\s+)?(?:first|second|third|final|last|ending|end)?\s*(verse|chorus|refrain|bridge|pre[\s-]?chorus|pre|post[\s-]?chorus|post|tag|coda|ending|outro|intro|interlude|instrumental|vamp)\s*(\d+|one|two|three|four|five|iii|ii|iv|i|v)?\b(.*)$/i;
// What may follow a label on its own line: qualifiers, never sung words.
const LABEL_TAIL_RE =
  /^\s*(?:cont(?:inued)?|no vamp|ending|chorus|tag|same as intro|bpm|capo\s*\d*|\(.*\)|\[.*\]|after key change|riff|repeated|spontaneous|twice|x?\d*x?)?\s*$/i;

export type LabelKind = { section: string } | { drop: true };

/** If the line is a section name ("VERSE 1", "Chorus (x2)", "Bridge 2x"), what to do with it. */
export function labelLine(line: string): LabelKind | null {
  const text = shown(stripDirections(line)).replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim();
  const m = LABEL_LINE_RE.exec(text);
  if (!m) return null;
  const tail = m[3] ?? "";
  // Band notation after an intro/interlude label ("Intro C F x2") still counts.
  const tailWords = stripDirections(tail)
    .split(/[\s/]+/)
    .filter(Boolean);
  const tailIsChords =
    tailWords.length > 0 && tailWords.every((w) => isChordToken(w) || /^(h|hm|nc)$/i.test(w));
  if (!LABEL_TAIL_RE.test(tail) && !LABEL_TAIL_RE.test(stripDirections(tail)) && !tailIsChords)
    return null;
  const word = m[1].toLowerCase().replace(/[\s-]/g, "");
  const n = m[2] ? (WORD_NUM[m[2].toLowerCase()] ?? Number(m[2])) : undefined;
  switch (word) {
    case "verse":
      // Unnumbered ("Second Verse") still takes its place in the count; the
      // renumbering pass gives every verse its final number.
      return { section: `Verse ${n ?? 0}` };
    case "chorus":
      return { section: "Chorus" };
    case "refrain":
      return { section: "Refrain" };
    case "bridge":
      return { section: "Bridge" };
    case "prechorus":
    case "pre":
      return { section: n ? `Pre-Chorus ${n}` : "Pre-Chorus" };
    case "postchorus":
    case "post":
    case "tag":
    case "coda":
    case "vamp":
      return { section: "Tag" };
    case "ending":
    case "outro":
      return { section: "Outro" };
    default:
      // Intro / Interlude / Instrumental: played, not sung.
      return { drop: true };
  }
}

// ---------------------------------------------------------------------------
// Plain-letter chords (become real chords) and chart notation (dropped)
// ---------------------------------------------------------------------------

const isNotationWord = (w: string) =>
  isChordToken(w) || /^(h|hm|h7|hm7|nc|n\.c\.|\/+|-|\|)$/i.test(w) || /^\d+$/.test(w);

/** True when a line holds nothing sung: chords, bars, beat slashes, counts. */
export function isNotationOnly(line: string): boolean {
  const words = shown(line)
    .replace(/[|()[\]]/g, " ")
    .split(/[\s/]+/)
    .filter(Boolean);
  return words.every(isNotationWord);
}

/**
 * Chords typed as plain letters at the end of a sung line ("Now I live to
 * bring Him praise F G C Em7 Am") become real chords at the end of that line.
 * Needs at least two chord tokens in the run, so a closing "I Am" or a sung
 * "A" is never taken for a chord.
 */
export function inlineTrailingChords(line: string): string {
  const parts = line.split(" ");
  let k = parts.length;
  while (k > 0 && isChordToken(parts[k - 1])) k--;
  const run = parts.slice(k);
  // One trailing token is too often a word ("the great I Am", "Eh", "A").
  if (k === 0 || run.length < 2) return line;
  return `${parts.slice(0, k).join(" ")} ${run.map((c) => `(${c})`).join("")}`;
}

// ---------------------------------------------------------------------------
// Glued lines ("meNone", "LordAll")
// ---------------------------------------------------------------------------

const GLUE_RE = /([a-z])((?:\([^()\s]+\))*)(?=[A-Z][a-z'])/g;
const GLUE_KEEP = /^(Mc|Mac|De|La|Le|Di|Du|O'|Ha)$/;

/** Splits a line where a lowercase letter runs straight into a capital. */
export function splitGlued(line: string): string[] {
  const out: string[] = [];
  let last = 0;
  for (const m of line.matchAll(GLUE_RE)) {
    const at = m.index + 1; // just after the lowercase letter
    const wordStart = line.lastIndexOf(" ", m.index) + 1;
    if (GLUE_KEEP.test(stripChordsRaw(line.slice(wordStart, at)))) continue;
    out.push(line.slice(last, at).trim());
    last = at;
  }
  out.push(line.slice(last).trim());
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Leading verse numbers
// ---------------------------------------------------------------------------

/** "1 Years I spent", "(G#)2 (A)Roaming": drops the number; "0 sing" was "O sing". */
export function stripLeadingNumber(line: string): string {
  return line
    .replace(/^((?:\([^()\s]+\))*)0\s+(?=[a-z])/, "$1O ")
    .replace(/^((?:\([^()\s]+\))*)[1-9]\s+(?=(?:\([^()\s]+\))*[A-Za-z])/, "$1");
}

// ---------------------------------------------------------------------------
// Whole verses typed on one line (split back into lines)
// ---------------------------------------------------------------------------

// Capitalised mid-line for their own sake, so a weaker place to break.
const ALWAYS_CAPS = new Set(
  (
    "I I'm I'll I've I'd God God's Lord Lord's Jesus Jesus' Christ Christ's Savior Saviour Redeemer King Father Son Spirit Ghost Holy Lamb " +
    "Name Friend Shepherd Master Prince Word Heaven Heav'n Thee Thou Thy Thine Him His He Himself Emmanuel Immanuel Israel Zion Jerusalem " +
    "Bethlehem Bethl'em Calvary Cal'vry Galilee Jordan Satan Mary Joseph David Adam Abraham Moses Sinai Egypt Canaan Judah Gentile Gentiles " +
    "Amen Hallelujah Alleluia Hosanna Gloria Advent Easter Christmas Trinity Godhead Creator Maker Almighty Most High Ancient Days Bread Life " +
    "Light Truth Way Rock Comforter Counselor Lion Morning Star Day Grace Church"
  ).split(" "),
);

const syllables = (w: string) => {
  const s = w
    .toLowerCase()
    .replace(/è/g, "e-")
    .normalize("NFD")
    .replace(/[^a-z-]/g, "")
    // A y between vowels is a consonant (roy-al, pray-er).
    .replace(/(?<=[aeiou])y(?=[aeiou])/g, "j");
  if (!s) return 0;
  const base = s
    .replace(/-/g, "a")
    .replace(/(?<=[^aeiouy])e$/, "")
    .replace(/(?<=[^aeiouytd])ed$/, "d")
    // A silent e before a closing s (comes, gives), but not after s, x, z, c
    // or g, where it is sung (places, praises, judges).
    .replace(/(?<=[aeiouy][^aeiouysxzcgh])es$/, "s");
  const groups = base.match(/[aeiouy]+/g)?.length ?? 1;
  // Vowel pairs sung as two syllables (tri-umph, glo-ri-ous, Le-o), except
  // the -tion / -cious / -tian endings where they merge.
  const hiatus = (
    base.replace(/(?<=[tcsx])i(?=[aeou])/g, "").match(/i[aou]|eo|u[ao]|ue(?=[a-z])/g) ?? []
  ).length;
  return Math.max(1, groups + hiatus);
};

type Word = { raw: string; syl: number; brk: number };

/** How good a place the start of this word is for a new line. */
function breakCost(raw: string): number {
  const t = stripChordsRaw(raw).replace(/^["'“‘(«]+/, "");
  if (!/^[A-Z]/.test(t)) return 5;
  return ALWAYS_CAPS.has(t.replace(/[^A-Za-z']/g, "")) ? 1 : 0;
}

const toWords = (line: string): Word[] =>
  line
    .split(" ")
    .filter(Boolean)
    .map((raw) => ({ raw, syl: syllables(stripChordsRaw(raw)), brk: breakCost(raw) }));

const offBy = (d: number) => (d <= 1 ? d * 0.5 : 0.5 + (d - 1) * 2);

/** Best way to cut `words` into lines of `meter` syllables: [cost, cut points]. */
function alignToMeter(words: Word[], meter: number[]): [number, number[]] {
  const n = words.length;
  const k = meter.length;
  const pre = [0];
  for (const w of words) pre.push(pre[pre.length - 1] + w.syl);
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(k + 1).fill(Infinity));
  const from = Array.from({ length: n + 1 }, () => new Array<number>(k + 1).fill(-1));
  dp[0][0] = 0;
  for (let j = 1; j <= k; j++) {
    for (let e = 1; e <= n; e++) {
      for (let s = e - 1; s >= 0; s--) {
        const syl = pre[e] - pre[s];
        if (syl > meter[j - 1] + 4) break;
        if (dp[s][j - 1] === Infinity) continue;
        // Syllable counts are estimates, so one off costs little. Lines over 10
        // syllables are rarer in hymns, so a long line costs a little extra:
        // otherwise two short lines run together always look cheapest.
        const v =
          dp[s][j - 1] +
          offBy(Math.abs(syl - meter[j - 1])) +
          Math.max(0, meter[j - 1] - 10) * 1.5 +
          (s === 0 ? 0 : words[s].brk);
        if (v < dp[e][j]) {
          dp[e][j] = v;
          from[e][j] = s;
        }
      }
    }
  }
  const cuts: number[] = [];
  for (let e = n, j = k; j > 0; j--) {
    const s = from[e][j];
    if (s < 0) return [Infinity, []];
    cuts.unshift(s);
    e = s;
  }
  return [dp[n][k], cuts];
}

/** Lines cut at every capital that isn't one always written with a capital. */
function capitalLines(words: Word[]): number[] {
  const cuts = [0];
  words.forEach((w, i) => i > 0 && w.brk === 0 && cuts.push(i));
  return cuts;
}

const lineSyllables = (words: Word[], cuts: number[]) =>
  cuts.map((c, i) => words.slice(c, cuts[i + 1] ?? words.length).reduce((a, w) => a + w.syl, 0));

const joinCuts = (words: Word[], cuts: number[]) =>
  snapLineStarts(
    cuts.map((c, i) =>
      words
        .slice(c, cuts[i + 1] ?? words.length)
        .map((w) => w.raw)
        .join(" "),
    ),
  );

/**
 * A cut one word too early leaves a line's first word stranded at the end of
 * the line before ("Lest our foes confound us To / Thee alone our Savior").
 * When a line ends in a capitalised word, or in a short run starting with an
 * ordinary capital ("The voice of"), and the next line opens on a lowercase
 * word or a word always written with a capital, the run moves down.
 */
export function snapLineStarts(lines: string[]): string[] {
  const out = [...lines];
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i].split(" ");
    const b = out[i + 1].split(" ");
    if (a.length < 3) continue;
    const nextBrk = breakCost(b[0]);
    // R1: a capitalised last word before a lowercase line.
    let move = nextBrk === 5 && breakCost(a[a.length - 1]) < 5 ? 1 : 0;
    // R2: an ordinary capital among the last three words before a weak start.
    if (!move && nextBrk > 0) {
      for (let k = 1; k <= 3 && k < a.length - 1; k++) {
        if (breakCost(a[a.length - k]) === 0) {
          move = k;
          break;
        }
      }
    }
    if (!move) continue;
    const moved = [...a.slice(a.length - move), ...b];
    if (moved.reduce((n, w) => n + syllables(stripChordsRaw(w)), 0) > 12) continue;
    out[i] = a.slice(0, a.length - move).join(" ");
    out[i + 1] = moved.join(" ");
    i++; // never pass words on twice
  }
  return out;
}

/**
 * Splits the verses of a hymn that were typed one verse to a line. Every verse
 * of a hymn shares one meter (7.6.7.6, 8.7.8.7), so the meter is worked out
 * from all of them together: each verse's capitals suggest a meter, every
 * suggestion is tried against every verse, and the one that fits them all best
 * wins. Each verse is then cut to that meter, preferring to start lines on a
 * capital. A verse that fits badly (a refrain in another meter) is cut at its
 * capitals instead.
 */
export function splitLongLines(
  lines: string[],
  linedVerses: string[][] = [],
  maxChars = 90,
): string[][] {
  const isLong = (l: string) => shown(l).length > maxChars;
  if (!lines.some(isLong)) return lines.map((l) => [l]);
  const verses = lines.filter(isLong).map(toWords);
  const sylOf = (words: Word[]) => words.reduce((a, w) => a + w.syl, 0);
  // One or two long lines in an otherwise lined song (a modern song with a
  // line or two run together) are cut at their capitals, not to a meter.
  if (verses.length <= 2 && verses.length < lines.length * 0.3) {
    return lines.map((line) =>
      isLong(line) ? joinCuts(toWords(line), capitalLines(toWords(line))) : [line],
    );
  }

  // Candidate meters: what each verse's capitals suggest, plus every
  // two-line pattern (8.7, 8.6, 7.6, 10.10, ...) and the four-line short
  // metre shapes, each repeated to fill the verse.
  const candidates = new Map<string, number[]>();
  // Hymn lines run 4 to 13 syllables; a "line" outside that is two lines run
  // together or a fragment.
  const add = (m: number[]) =>
    m.length && m.every((n) => n >= 4 && n <= 13) && candidates.set(m.join("."), m);
  for (const words of verses) {
    const m = lineSyllables(words, capitalLines(words));
    add(m);
    if (m.length % 2 === 0) add(m.slice(0, m.length / 2));
  }
  for (let a = 4; a <= 13; a++) for (let b = 4; b <= 13; b++) add([a, b]);
  add([6, 6, 8, 6]);
  add([6, 6, 6, 6, 8, 8]);
  add([8, 7, 8, 7, 8, 8, 7]);

  const fit = (words: Word[], meter: number[]): [number, number[]] => {
    const total = meter.reduce((a, b) => a + b, 0);
    const reps = Math.max(1, Math.round(sylOf(words) / total));
    return alignToMeter(words, Array.from({ length: reps }, () => meter).flat());
  };

  let best: { meter: number[]; cost: number } | null = null;
  for (const meter of candidates.values()) {
    let cost = 0;
    for (const words of verses) cost += fit(words, meter)[0];
    if (!best || cost < best.cost) best = { meter, cost };
  }

  return lines.map((line) => {
    const words = toWords(line);
    const meter = best?.meter;
    const total = meter ? meter.reduce((a, b) => a + b, 0) : 0;
    const byCapitals = () => (isLong(line) ? joinCuts(words, capitalLines(words)) : [line]);
    if (!meter || sylOf(words) < total * 0.75) return byCapitals();
    const [cost, cuts] = fit(words, meter);
    // A verse that fits badly (a refrain in another meter) is cut at its capitals.
    if (!cuts.length || cost / cuts.length > 3) return byCapitals();
    return joinCuts(words, cuts);
  });
}

// ---------------------------------------------------------------------------
// The whole song
// ---------------------------------------------------------------------------

/** Lines that are notes to the band or reader, never sung. */
const NOTE_LINE_RE =
  /♩|\bbpm\b|^©|copyright|ccli|\*\*(?:akkorde|tonart)\*\*|this is very easy to play|^instrumental\b|^words and music by|^originally in [a-g]|comfortable to sing in/i;

/**
 * Hand fixes for lines no rule can read (scripts/song-fixes.json): per song
 * title, the exact line mapped to its replacement (may hold "\n" and section
 * headings) or null to drop it. "__lyrics__" replaces the whole song.
 */
export type LineFixes = Record<string, Record<string, string | null>>;

export function cleanSongLyrics(lyrics: string, title = "", fixes: LineFixes = {}): string {
  // Run to a fixed point: a verse the meter pass couldn't place on the first
  // round (half of it already lined) is placed on the next, so a later run
  // over the committed file never finds more to do.
  let out = cleanOnce(lyrics, title, fixes);
  for (let i = 0; i < 3; i++) {
    const next = cleanOnce(out, title, {});
    if (next === out) break;
    out = next;
  }
  return out;
}

function cleanOnce(lyrics: string, title: string, fixes: LineFixes): string {
  const songFixes = fixes[title] ?? {};
  // A song too broken to repair line by line is replaced whole.
  const whole = songFixes.__lyrics__;
  if (typeof whole === "string") return whole;
  const lines = normaliseChars(lyrics).split("\n");
  const out: string[] = [];
  // Index in `out` of the current section heading, and whether it has lines yet.
  let headingAt = -1;
  let sectionHasLines = false;

  const pushHeading = (label: string) => {
    if (headingAt >= 0 && !sectionHasLines) {
      // A label typed right under a heading names that same block.
      out[headingAt] = `[${label}]`;
      return;
    }
    if (out.length) out.push("");
    out.push(`[${label}]`);
    headingAt = out.length - 1;
    sectionHasLines = false;
  };

  const handle = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (SECTION_RE.test(trimmed)) {
      pushHeading(trimmed.slice(1, -1).trim());
      return;
    }
    if (trimmed in songFixes) {
      const fixed = songFixes[trimmed];
      if (fixed !== null) for (const l of fixed.split("\n")) handleClean(l);
      return;
    }
    for (const part of splitGlued(trimmed)) handleClean(part, true);
  };

  const handleClean = (raw: string, rules = true) => {
    let line = raw.trim();
    if (!line) return;
    if (SECTION_RE.test(line)) {
      pushHeading(line.slice(1, -1).trim());
      return;
    }
    if (rules) {
      if (NOTE_LINE_RE.test(shown(line))) return;
      if (/[‹„ˆŒŠ]/.test(line)) return; // garbled chord row
      const label = labelLine(line);
      if (label) {
        if ("section" in label) pushHeading(label.section);
        return;
      }
      if (
        DIRECTION_LINE_RE.test(shown(stripDirections(line)).trim()) ||
        DIRECTION_LINE_RE.test(shown(line).trim())
      )
        return;
      line = stripDirections(line);
      line = stripLeadingNumber(line);
      line = line.replace(/[[\]]/g, "").replace(/ {2,}/g, " ").trim();
      if (!line || isNotationOnly(line)) return;
      line = inlineTrailingChords(line);
    }
    out.push(line);
    sectionHasLines = true;
  };

  for (const l of lines) handle(l);
  const lyricAt = out.flatMap((l, i) => (l && !SECTION_RE.test(l) ? [i] : []));
  const lyricLines = lyricAt.map((i) => out[i]);
  if (lyricLines.some((l) => shown(l).length > 90)) {
    // The meter is learnt across the whole song, then applied line by line.
    const blocks: string[][] = [[]];
    for (const l of out) {
      if (!l || SECTION_RE.test(l)) blocks.push([]);
      else blocks[blocks.length - 1].push(l);
    }
    const lined = blocks.filter((b) => b.length >= 2 && b.every((l) => shown(l).length <= 90));
    const split = splitLongLines(lyricLines, lined);
    lyricAt.forEach((i, k) => (out[i] = split[k].join("\n")));
  }
  return dropEmptyBlocksAndRenumber(out.join("\n"));
}

/**
 * Drops section headings with nothing under them and renumbers Verse and
 * Pre-Chorus so they run 1, 2, 3 (same rule as scripts/build-songs.mjs).
 */
export function dropEmptyBlocksAndRenumber(lyrics: string): string {
  type Block = { label: string | null; lines: string[] };
  const blocks: Block[] = [];
  let current: Block = { label: null, lines: [] };
  for (const line of lyrics.split("\n")) {
    const m = /^\[([^\]]*)\]$/.exec(line.trim());
    if (m) {
      blocks.push(current);
      current = { label: m[1], lines: [] };
    } else if (line.trim()) {
      current.lines.push(line);
    }
  }
  blocks.push(current);
  const kept = blocks.filter((b) => b.lines.length > 0);
  const counters: Record<string, number> = {};
  const out: string[] = [];
  for (const b of kept) {
    if (out.length) out.push("");
    if (b.label === null) {
      out.push(...b.lines);
      continue;
    }
    const m = /^(Verse|Pre-Chorus)\s+\d+$/.exec(b.label);
    let label = b.label;
    if (m) {
      counters[m[1]] = (counters[m[1]] ?? 0) + 1;
      label = `${m[1]} ${counters[m[1]]}`;
    }
    out.push(`[${label}]`, ...b.lines);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
