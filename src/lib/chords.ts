/**
 * Chord support for songs.
 *
 * Chords are typed inline in the lyrics, in round brackets, anchored to the
 * syllable they land on:
 *
 *     Amazing (G)grace how (C)sweet the (G)sound
 *
 * They live inside `Slide.lines` so the phone view (which reads slides straight
 * out of Supabase) can render them, and are stripped at render time by every
 * projected surface — presenter preview and live output never show a chord.
 *
 * Nothing here mutates the lyrics the leader typed. The written key and the
 * display mode are stored on the set, and letters/numbers/transposition are
 * derived on the fly, so flipping between them is always reversible.
 */

export type ChordDisplay = "letters" | "numbers";

export interface SongChords {
  /** The key the chord text is currently written in. Transposing rewrites every
   *  chord in the lyrics and moves this with them, so it is always the truth
   *  about what is stored — which is what lets numbers be derived from it. */
  key: string;
  /** How chords render wherever they're visible. */
  display: ChordDisplay;
  /** Switched off. The chords stay in the lyrics untouched, but nothing shows
   *  them: not the editor's own box, the preview, or the phone view. Kept as a
   *  flag rather than dropping the object so `key` and `display` survive being
   *  toggled off and back on. */
  hidden?: boolean;
}

/** The twelve keys offered in the editor, indexed by semitone from C. */
export const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const NATURAL_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Keys conventionally spelled with flats. Everything else gets sharps. */
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]);

/** Scale degree for each semitone above the tonic, Nashville-style. */
const DEGREES = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];

const NOTE = "[A-G](?:#{1,2}|b{1,2})?";

// Chord qualities, as an explicit whitelist. This is what stops ordinary
// parenthetical lyrics from being eaten as chords: "(Chorus)" starts with a
// valid root but "horus" matches no quality, so it stays literal text.
const QUALITY = "(?:maj|min|aug|dim|sus|add|alt|dom|no|M|m|\\+|-|°|ø|Δ|\\d+|#\\d+|b\\d+)*";

const CHORD_RE = new RegExp(`^(${NOTE})(${QUALITY})(?:/(${NOTE}))?$`);

interface ParsedChord {
  root: string;
  quality: string;
  bass?: string;
}

function parseChord(token: string): ParsedChord | null {
  if (!token || /\s/.test(token)) return null;
  const m = CHORD_RE.exec(token);
  if (!m) return null;
  return { root: m[1], quality: m[2] ?? "", bass: m[3] || undefined };
}

/** True when the text inside a pair of brackets is a chord rather than a lyric aside. */
export function isChordToken(token: string): boolean {
  return parseChord(token) !== null;
}

function pitchOf(note: string): number | null {
  const m = /^([A-G])(#{1,2}|b{1,2})?$/.exec(note);
  if (!m) return null;
  let p = NATURAL_PITCH[m[1]];
  for (const ch of m[2] ?? "") p += ch === "#" ? 1 : -1;
  return ((p % 12) + 12) % 12;
}

function spell(pitch: number, key: string): string {
  return (FLAT_KEYS.has(key) ? FLAT_NOTES : SHARP_NOTES)[((pitch % 12) + 12) % 12];
}

/** Transpose a single chord token from one key into another. */
export function transposeChord(token: string, fromKey: string, toKey: string): string {
  const c = parseChord(token);
  const from = pitchOf(fromKey);
  const to = pitchOf(toKey);
  if (!c || from === null || to === null) return token;
  const shift = (to - from + 12) % 12;
  if (shift === 0) return token;

  const rootPitch = pitchOf(c.root);
  if (rootPitch === null) return token;
  let out = spell(rootPitch + shift, toKey) + c.quality;

  if (c.bass) {
    const bassPitch = pitchOf(c.bass);
    out += "/" + (bassPitch === null ? c.bass : spell(bassPitch + shift, toKey));
  }
  return out;
}

/** Convert a chord token to its Nashville number in `key` — Am in G becomes "2m". */
export function chordToNumber(token: string, key: string): string {
  const c = parseChord(token);
  const tonic = pitchOf(key);
  if (!c || tonic === null) return token;

  const rootPitch = pitchOf(c.root);
  if (rootPitch === null) return token;
  let out = DEGREES[(rootPitch - tonic + 12) % 12] + c.quality;

  if (c.bass) {
    const bassPitch = pitchOf(c.bass);
    out += "/" + (bassPitch === null ? c.bass : DEGREES[(bassPitch - tonic + 12) % 12]);
  }
  return out;
}

/** Render a chord token the way the song is configured to display it. The text
 *  is already stored in `cfg.key`, so letters need no work. */
export function renderChord(token: string, cfg: SongChords): string {
  return cfg.display === "numbers" ? chordToNumber(token, cfg.key) : token;
}

/**
 * Map a key tag from an imported song onto one of the twelve keys used here.
 * Minor tags fold to their relative major ("Am" → "C", "Em" → "G"), since
 * numbers are reckoned from the major scale. Unrecognised tags return null.
 */
export function normaliseKeyTag(tag: string): string | null {
  const m = /^([A-G][#b]?)\s*(m|min|minor)?$/i.exec(tag.trim());
  if (!m) return null;
  const pitch = pitchOf(m[1].charAt(0).toUpperCase() + m[1].slice(1));
  if (pitch === null) return null;
  return KEYS[m[2] ? (pitch + 3) % 12 : pitch];
}

/** Semitones above the tonic for each written scale degree. */
const SEMITONE_BY_DEGREE: Record<string, number> = {
  "1": 0,
  "#1": 1,
  b2: 1,
  "2": 2,
  "#2": 3,
  b3: 3,
  "3": 4,
  b4: 4,
  "4": 5,
  "#4": 6,
  b5: 6,
  "5": 7,
  "#5": 8,
  b6: 8,
  "6": 9,
  "#6": 10,
  b7: 10,
  "7": 11,
};

const DEGREE = "[#b]?[1-7]";
const NUMBER_CHORD_RE = new RegExp(`^(${DEGREE})(${QUALITY})(?:/(${DEGREE}))?$`);

/** True when a bracketed token is a Nashville number rather than a letter chord. */
export function isNumberToken(token: string): boolean {
  return !!token && !/\s/.test(token) && NUMBER_CHORD_RE.test(token);
}

/** Turn a Nashville number back into the letter chord it names in `key`. */
export function numberToChord(token: string, key: string): string {
  const tonic = pitchOf(key);
  if (tonic === null) return token;
  const m = NUMBER_CHORD_RE.exec(token);
  if (!m) return token;
  const [, degree, quality, bass] = m;
  const semi = SEMITONE_BY_DEGREE[degree];
  if (semi === undefined) return token;
  let out = spell(tonic + semi, key) + quality;
  if (bass) {
    const bassSemi = SEMITONE_BY_DEGREE[bass];
    out += "/" + (bassSemi === undefined ? bass : spell(tonic + bassSemi, key));
  }
  return out;
}

/** Show every chord in a block of lyrics as its Nashville number. */
export function lyricsToNumbers(text: string, key: string): string {
  return text.replace(/\(([^()\s]+)\)/g, (whole, token: string) =>
    isChordToken(token) ? `(${chordToNumber(token, key)})` : whole,
  );
}

/** Turn numbered chords in a block of lyrics back into letters. */
export function numbersToLyrics(text: string, key: string): string {
  return text.replace(/\(([^()\s]+)\)/g, (whole, token: string) =>
    isNumberToken(token) ? `(${numberToChord(token, key)})` : whole,
  );
}

/**
 * Rewrite every inline chord in a block of lyrics into a new key. Parentheses
 * that aren't chords — "(x2)", "(repeat)" — are left exactly as they are.
 */
export function transposeLyrics(text: string, fromKey: string, toKey: string): string {
  if (fromKey === toKey) return text;
  return text.replace(/\(([^()\s]+)\)/g, (whole, token: string) =>
    isChordToken(token) ? `(${transposeChord(token, fromKey, toKey)})` : whole,
  );
}

/**
 * The seven diatonic triads of a major key, in scale order — in G that is
 * G Am Bm C D Em F#dim. This is the chord palette for the key.
 */
export function diatonicChords(key: string): string[] {
  const tonic = pitchOf(key);
  if (tonic === null) return [];
  const STEPS = [0, 2, 4, 5, 7, 9, 11];
  const QUALITIES = ["", "m", "m", "", "", "m", "dim"];
  return STEPS.map((step, i) => spell(tonic + step, key) + QUALITIES[i]);
}

export interface ChordAnchor {
  chord: string;
  /** Index into the stripped `text` of the character this chord sits over. */
  index: number;
}

export interface ParsedChordLine {
  /** The lyric with chord tokens removed and the gaps they left closed up. */
  text: string;
  chords: ChordAnchor[];
}

/**
 * Split one lyric line into its plain text and the chords anchored within it.
 *
 * A chord written before a space — `Amazing (G) grace` — snaps forward onto the
 * next word, so it lands in the same place as `Amazing (G)grace`. Chords with
 * nothing after them anchor past the end of the text.
 */
export function parseChordLine(line: string): ParsedChordLine {
  const chords: ChordAnchor[] = [];
  let text = "";
  // Chords held until the next non-space character shows up to anchor them.
  let pending: string[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === "(") {
      const close = line.indexOf(")", i + 1);
      if (close > i && isChordToken(line.slice(i + 1, close))) {
        pending.push(line.slice(i + 1, close));
        i = close + 1;
        continue;
      }
    }

    if (/\s/.test(ch)) {
      // Removing a chord leaves a double space behind — collapse as we go so
      // the anchor indices stay in step with the text we actually render.
      if (text.length > 0 && !text.endsWith(" ")) text += " ";
      i++;
      continue;
    }

    for (const c of pending) chords.push({ chord: c, index: text.length });
    pending = [];
    text += ch;
    i++;
  }

  text = text.replace(/\s+$/, "");
  for (const c of pending) chords.push({ chord: c, index: text.length });
  return { text, chords };
}

/** The lyric line with every chord removed — what the projector shows. */
export function stripChords(line: string): string {
  return parseChordLine(line).text;
}

/**
 * Like `parseChordLine`, but leaves every other character exactly where it is —
 * no whitespace collapsing, no trimming. This is what the editor shows when
 * chords are hidden, so what the user types has to survive untouched.
 */
function parseRawChordLine(line: string): ParsedChordLine {
  const chords: ChordAnchor[] = [];
  let text = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] === "(") {
      const close = line.indexOf(")", i + 1);
      if (close > i && isChordToken(line.slice(i + 1, close))) {
        chords.push({ chord: line.slice(i + 1, close), index: text.length });
        i = close + 1;
        continue;
      }
    }
    text += line[i];
    i++;
  }
  return { text, chords };
}

/** One lyric line with its chord tokens removed and nothing else changed. */
export function stripChordsRaw(line: string): string {
  return parseRawChordLine(line).text;
}

/** A whole block of lyrics with the chord tokens removed and nothing else changed. */
export function hideChords(text: string): string {
  return text.split("\n").map(stripChordsRaw).join("\n");
}

/** For each element of `a`, the index in `b` it pairs with, or -1. */
function lcsMap<T>(a: T[], b: T[]): number[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const map: number[] = new Array(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      map[i] = j;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
}

function wordSpans(text: string): { text: string; start: number }[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ text: m[0], start: m.index }));
}

/** Move one line's chords onto an edited version of that line, by word. */
function reanchorLine(oldFull: string, newText: string): string {
  const { text: oldText, chords } = parseRawChordLine(oldFull);
  if (chords.length === 0) return newText;
  if (oldText === newText) return oldFull; // untouched — keep it verbatim
  // An instrumental line only survives while its (blank) line does.
  if (oldText.trim() === "") return newText.trim() === "" ? oldFull : newText;

  const oldWords = wordSpans(oldText);
  const newWords = wordSpans(newText);
  const wordMap = lcsMap(
    oldWords.map((w) => w.text),
    newWords.map((w) => w.text),
  );

  const inserts: { at: number; chord: string }[] = [];
  for (const c of chords) {
    let wi = oldWords.findIndex((w) => c.index >= w.start && c.index < w.start + w.text.length);
    if (wi < 0) wi = oldWords.findIndex((w) => w.start >= c.index);
    if (wi < 0) {
      inserts.push({ at: newText.length, chord: c.chord }); // trailing chord
      continue;
    }
    const nj = wordMap[wi];
    if (nj < 0) continue; // the word it sat on is gone, so the chord goes too
    const offset = Math.min(c.index - oldWords[wi].start, newWords[nj].text.length);
    inserts.push({ at: newWords[nj].start + offset, chord: c.chord });
  }

  let out = newText;
  for (const ins of [...inserts].sort((x, y) => y.at - x.at)) {
    out = out.slice(0, ins.at) + `(${ins.chord})` + out.slice(ins.at);
  }
  return out;
}

/**
 * Move a run of chorded lines onto a run of edited lines whose line count no
 * longer matches — the shape an edit takes when a line was split with Enter or
 * two were joined with Backspace.
 *
 * The single-line version can't express that: it asks where each chord's word
 * went *within one line*, and a word that moved to the next line reads as a
 * word that was deleted, so the chord is dropped. Here the words of the whole
 * run are matched as one sequence, and a chord is placed on whichever new line
 * its word ended up on.
 */
function reanchorBlock(oldLines: string[], newLines: string[]): string[] {
  const parsed = oldLines.map(parseRawChordLine);
  if (parsed.every((p) => p.chords.length === 0)) return newLines;

  const out = [...newLines];

  // An instrumental line — chords with no lyric under them — has no word to
  // follow, so it can only be paired with a blank line. Those are matched off
  // in order and kept out of the word matching entirely.
  const blanks = newLines.reduce<number[]>(
    (acc, l, i) => (l.trim() === "" ? [...acc, i] : acc),
    [],
  );
  const lyricLines: number[] = [];
  let nextBlank = 0;
  parsed.forEach((p, li) => {
    if (p.text.trim() !== "") {
      lyricLines.push(li);
      return;
    }
    if (p.chords.length === 0) return;
    const target = blanks[nextBlank++];
    if (target !== undefined) out[target] = oldLines[li];
  });

  // Both sides flattened to a single word sequence, each word remembering the
  // line it came from so a chord can be put back on the right one.
  type Located = { text: string; line: number; start: number };
  const oldWords: Located[] = [];
  const rangeOf = new Map<number, [number, number]>();
  for (const li of lyricLines) {
    const from = oldWords.length;
    for (const w of wordSpans(parsed[li].text)) {
      oldWords.push({ text: w.text, line: li, start: w.start });
    }
    rangeOf.set(li, [from, oldWords.length]);
  }
  const newWords: Located[] = [];
  newLines.forEach((line, li) => {
    for (const w of wordSpans(line)) newWords.push({ text: w.text, line: li, start: w.start });
  });

  const wordMap = lcsMap(
    oldWords.map((w) => w.text),
    newWords.map((w) => w.text),
  );

  const inserts: { line: number; at: number; chord: string }[] = [];
  for (const li of lyricLines) {
    const [from, to] = rangeOf.get(li)!;
    const lineWords = oldWords.slice(from, to);
    for (const c of parsed[li].chords) {
      let k = lineWords.findIndex((w) => c.index >= w.start && c.index < w.start + w.text.length);
      if (k < 0) k = lineWords.findIndex((w) => w.start >= c.index);
      if (k < 0) {
        // A chord parked past the last word of its line trails whatever that
        // word became.
        const last = wordMap[to - 1];
        if (to === from || last < 0) continue;
        const w = newWords[last];
        inserts.push({ line: w.line, at: w.start + w.text.length, chord: c.chord });
        continue;
      }
      const nj = wordMap[from + k];
      if (nj < 0) continue; // the word it sat on is gone, so the chord goes too
      const w = newWords[nj];
      inserts.push({
        line: w.line,
        at: w.start + Math.min(c.index - lineWords[k].start, w.text.length),
        chord: c.chord,
      });
    }
  }

  for (let li = 0; li < out.length; li++) {
    const mine = inserts.filter((x) => x.line === li);
    out[li] = [...mine]
      .sort((a, b) => b.at - a.at)
      .reduce((s, ins) => s.slice(0, ins.at) + `(${ins.chord})` + s.slice(ins.at), out[li]);
  }
  return out;
}

/**
 * Put the chords from `full` back onto `edited` — the same lyrics with the
 * chords stripped out and then hand-edited in the box.
 *
 * Chords are anchored to the word they sit on and follow it wherever it moves,
 * so inserting, removing or reordering words keeps them in place. A chord whose
 * word was deleted goes with it. Guarantees `hideChords(result) === edited`, so
 * the visible text is never rewritten under the user's caret.
 */
export function reapplyChords(full: string, edited: string): string {
  const oldLines = full.split("\n");
  const oldStripped = oldLines.map(stripChordsRaw);
  const newLines = edited.split("\n");
  const out = [...newLines];

  // Lines that survived verbatim are the strong anchors — they're what keeps a
  // repeated chorus from matching against the wrong copy of itself. The runs
  // between them are then reconciled on their own.
  const lineMap = lcsMap(oldStripped, newLines);
  let oi = 0;
  let nj = 0;
  const fillGap = (oEnd: number, nEnd: number) => {
    const oldBlock = oldLines.slice(oi, oEnd);
    const newBlock = newLines.slice(nj, nEnd);
    if (oldBlock.length === 0 || newBlock.length === 0) return;
    if (oldBlock.length === newBlock.length) {
      // Same shape: each line is still recognisably the line it came from.
      oldBlock.forEach((line, k) => (out[nj + k] = reanchorLine(line, newBlock[k])));
    } else {
      // The line count changed, so words have crossed line boundaries.
      reanchorBlock(oldBlock, newBlock).forEach((line, k) => (out[nj + k] = line));
    }
  };
  lineMap.forEach((j, i) => {
    if (j < 0) return;
    fillGap(i, j);
    out[j] = oldLines[i]; // identical stripped text — keep the original verbatim
    oi = i + 1;
    nj = j + 1;
  });
  fillGap(oldLines.length, newLines.length);

  return out.join("\n");
}

/** True when a line is nothing but chords, e.g. an instrumental `(G) (C) (D)`. */
export function isChordOnlyLine(line: string): boolean {
  const { text, chords } = parseChordLine(line);
  return chords.length > 0 && text === "";
}

/** True when any line of a song carries at least one chord. */
export function hasChords(text: string): boolean {
  return text.split("\n").some((line) => parseChordLine(line).chords.length > 0);
}

/** Every diatonic scale degree, as a semitone offset from the tonic. */
const SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];

/**
 * The chord quality a major key expects on each of its scale degrees:
 * I and IV and V major, ii and iii and vi minor, vii diminished.
 */
const DEGREE_QUALITY: ("major" | "minor" | "dim")[] = [
  "major", // I
  "minor", // ii
  "minor", // iii
  "major", // IV
  "major", // V
  "minor", // vi
  "dim", // vii
];

/**
 * Work out the key a song is in from its chords.
 *
 * Only reached when nothing authoritative is available. A song imported from
 * the library carries its published key and never comes through here; this is
 * for a pasted sheet or hand-typed chords, and always seeds a field the leader
 * can change.
 *
 * What makes it work is reading chord QUALITY, not just root. Every major key
 * expects a specific major/minor/diminished pattern across its seven degrees,
 * so an Am says something quite different about the key from an A. Scoring how
 * well a song's chords match that pattern separates keys that a root-only
 * comparison cannot tell apart at all: C and G share six of seven notes, but
 * only one of them wants an E minor and an F major.
 *
 * That single change is worth about nine points of accuracy. A handful of small
 * tie-breaks on top — opening chord, closing chord, overall frequency, and the
 * common case of opening on the relative minor — settle the rest.
 *
 * Measured against the 1,479 library songs carrying a human-set key, the only
 * ground truth available: about 75%, against about 65% for the diatonic-root
 * approach and 65% for taking the first chord's root. Not exact, and not
 * treated as such anywhere.
 */
export function guessKey(text: string): string | null {
  const parsed: { root: number; quality: "major" | "minor" | "dim" }[] = [];
  for (const line of text.split("\n")) {
    for (const { chord } of parseChordLine(line).chords) {
      const c = parseChord(chord);
      if (!c) continue;
      const root = pitchOf(c.root);
      if (root === null) continue;
      const q = c.quality;
      const quality = /^(m|min)(?!aj)/.test(q) ? "minor" : /dim|°|ø/.test(q) ? "dim" : "major";
      parsed.push({ root, quality });
    }
  }
  if (parsed.length === 0) return null;
  if (parsed.length === 1) return KEYS[parsed[0].root];

  const counts = new Map<number, number>();
  for (const { root } of parsed) counts.set(root, (counts.get(root) ?? 0) + 1);
  const total = parsed.length;
  const first = parsed[0].root;
  const last = parsed[parsed.length - 1].root;

  // How much of the song sits on the degree its key would predict. A chord off
  // the scale entirely, or on the scale but the wrong quality, simply doesn't
  // count toward the key -- it neither helps nor actively penalises, so a
  // borrowed chord or a passing secondary dominant can't sink an otherwise
  // obvious key.
  const qualityFit = (tonic: number) => {
    let matched = 0;
    for (const { root, quality } of parsed) {
      const step = SCALE_STEPS.indexOf((root - tonic + 12) % 12);
      if (step === -1) continue;
      const want = DEGREE_QUALITY[step];
      // A diminished vii is rare enough in this repertoire that anything
      // landing there is treated as fitting rather than as evidence against.
      if (want === "dim" || want === quality) matched++;
    }
    return matched / total;
  };

  let best = 0;
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    // The fit dominates; the rest only separate keys it leaves close together.
    let score = qualityFit(tonic) * 100;
    if (first === tonic) score += 4;
    if (last === tonic) score += 1;
    score += ((counts.get(tonic) ?? 0) / total) * 2;
    if (first === (tonic + 9) % 12) score += 2; // opened on the relative minor
    if (score > bestScore) {
      bestScore = score;
      best = tonic;
    }
  }
  return KEYS[best];
}

/**
 * True when every token on a line is a chord: an Ultimate Guitar style chord
 * row sitting above its lyric, or a standalone instrumental line.
 */
export function isChordRow(line: string, opts: { numbers?: boolean } = {}): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const ok = (t: string) => isChordToken(t) || (opts.numbers === true && isNumberToken(t));
  return tokens.every(ok);
}

/** How a chord row is read back. */
export interface ChordRowOpts {
  /** How a chord label is written in the row, e.g. as a Nashville number. */
  render?: (chord: string) => string;
  /**
   * The inverse of `render`: turns a row token back into the letter chord that
   * belongs in storage. Required whenever a row can carry numbers — without it,
   * a re-derived line would splice the bare number in as `(4)`, which isn't a
   * valid chord token and so is never recognised again; it just leaks into the
   * lyric as literal text.
   */
  read?: (token: string) => string;
  /**
   * Nudge a chord onto the word it lands over. Right for sheets pasted from
   * elsewhere, where column alignment is approximate. Must be off when reading
   * back our own editor output, or a deliberate mid-word chord would jump to
   * the start of its word on the first keystroke.
   */
  snap?: boolean;
  /** Treat Nashville numbers as chords, for reading back a numbered sheet. */
  numbers?: boolean;
}

const SECTION_RE =
  /^(intro|verse|chorus|pre[-\s]?chorus|bridge|outro|tag|interlude|refrain|instrumental|ending|vamp|turnaround)\s*\d*$/i;

/**
 * Bare section labels like "Verse 1" become `[Verse 1]`, so they group slides
 * instead of being projected as a lyric. Already-bracketed labels pass through.
 */
function bracketSectionLabel(line: string): string {
  const t = line.trim();
  if (!t || /^\[.+\]$/.test(t)) return line;
  return SECTION_RE.test(t) ? `[${t}]` : line;
}

/**
 * Render inline-chord lyrics as a chord sheet — each lyric line preceded by a
 * row carrying its chords at the columns they sit over. This is what the editor
 * box shows; `chordRowsToInline(…, { snap: false })` reads it back, and the two
 * round-trip so the box is never rewritten under the caret.
 *
 * No "." marker on the row: it would occupy a column and push every chord one
 * character right of the word it belongs to.
 */
function renderOneLine(line: string, render: (chord: string) => string): string[] {
  const { text: lyric, chords } = parseRawChordLine(line);
  if (chords.length === 0) return [lyric];

  let row = "";
  for (const c of chords) {
    // A label must never overrun the one before it; one space is the smallest
    // gap that still reads as two chords rather than one. When that nudges a
    // label off its true column the row can no longer state the exact anchor,
    // which is what readChordRows' memory exists to cover.
    const at = Math.max(c.index, row.length === 0 ? 0 : row.length + 1);
    row = row.padEnd(at) + render(c.chord);
  }
  // An instrumental break has no lyric to sit above; the row stands alone.
  return lyric.trim() === "" ? [row] : [row, lyric];
}

interface RowLayoutLine {
  text: string;
  /** Which stored lyric line this box line came from, or null for the
   *  synthetic blank line that separates a lone instrumental row from the
   *  lyric after it — there is no lyric line to attribute that blank to. */
  storedLine: number | null;
  kind: "row" | "lyric" | "plain" | "blank";
}

/**
 * The one place that walks stored lyrics into box lines. `inlineToChordRows`
 * is a thin wrapper over this; `insertChordAtBoxOffset` needs the same walk to
 * map a caret position in the box back to a (stored line, column) — building
 * it twice would drift the moment either changed.
 */
function buildChordRowLayout(lyrics: string, render: (chord: string) => string): RowLayoutLine[] {
  const storedLines = lyrics.split("\n");
  const out: RowLayoutLine[] = [];

  for (let i = 0; i < storedLines.length; i++) {
    const rendered = renderOneLine(storedLines[i], render);
    if (rendered.length === 1) {
      out.push({ text: rendered[0], storedLine: i, kind: "plain" });
    } else {
      out.push({ text: rendered[0], storedLine: i, kind: "row" });
      out.push({ text: rendered[1], storedLine: i, kind: "lyric" });
    }
    // A lone row followed by a lyric would be read back as that lyric's chords,
    // so a blank line keeps the instrumental break separate.
    if (rendered.length === 1 && rendered[0].trim() !== "" && isChordRow(rendered[0])) {
      const next = storedLines[i + 1];
      if (next !== undefined && next.trim() !== "")
        out.push({ text: "", storedLine: null, kind: "blank" });
    }
  }
  return out;
}

export function inlineToChordRows(
  text: string,
  render: (chord: string) => string = (c) => c,
): string {
  return buildChordRowLayout(text, render)
    .map((l) => l.text)
    .join("\n");
}

/**
 * Drop a chord into the box at a caret position, the way the palette does.
 *
 * The box text is never spliced directly: the caret might land in the middle
 * of a LYRIC word (a completely reasonable place to click before choosing a
 * chord), and inserting raw text there would type the chord label straight
 * into the word. Instead the caret is mapped back to (stored line, column in
 * that line's stripped lyric) via the same layout `inlineToChordRows` builds,
 * a proper bracketed chord is spliced into the STORED line at that column, and
 * the box is re-rendered from the result — so this can never leave a lyric or
 * a chord label corrupted, whichever line the caret happens to be on.
 *
 * Returns the caret position in the newly rendered box, right after the label
 * that was just placed, so clicking further palette chords continues in place.
 */
export function insertChordAtBoxOffset(
  lyrics: string,
  boxOffset: number,
  chord: string,
  render: (chord: string) => string = (c) => c,
): { lyrics: string; caret: number } {
  const layout = buildChordRowLayout(lyrics, render);

  const storedLines = lyrics.split("\n");
  const isSection = (i: number) => /^\[.+\]$/.test(storedLines[i].trim());

  let cursor = 0;
  let hit: { line: RowLayoutLine; offset: number } | null = null;
  for (const line of layout) {
    const end = cursor + line.text.length;
    // A section marker only ever gets here via kind "plain" (it carries no
    // chords), which is also the one kind whose coordinate space is the raw
    // stored line — skip it so a click that lands on "[Verse 1]" can't splice
    // a chord into the label instead of a lyric.
    if (
      boxOffset <= end &&
      !(line.kind === "plain" && line.storedLine !== null && isSection(line.storedLine))
    ) {
      hit = { line, offset: Math.max(0, boxOffset - cursor) };
      break;
    }
    cursor = end + 1; // +1 for the newline the join() will have put here
  }

  // Nowhere recognisable to anchor to (an empty box, the synthetic blank
  // separator, or every remaining line was a section marker) — append a fresh
  // instrumental line instead of guessing at a position.
  if (!hit || hit.line.storedLine === null) {
    const newLyrics = lyrics + (lyrics.length && !lyrics.endsWith("\n") ? "\n" : "") + `(${chord})`;
    return { lyrics: newLyrics, caret: inlineToChordRows(newLyrics, render).length };
  }

  const li = hit.line.storedLine;
  const rawLine = storedLines[li];
  const before = renderOneLine(rawLine, render);
  const { text: stripped, chords: existing } = parseRawChordLine(rawLine);

  let newLine: string;
  if (stripped.trim() === "") {
    // An instrumental line — nothing but chords, no word to anchor a column
    // to, and its near-empty stripped text puts every existing chord at
    // almost the same index, which the sparse per-index splice below can't
    // order correctly on a tie. Simplest correct move: append.
    newLine = [...existing.map((c) => c.chord), chord].map((c) => `(${c})`).join(" ");
  } else {
    // A row's columns are meant to line up with the lyric beneath it, so both
    // kinds map onto the same stripped-text coordinate.
    const strippedOffset = Math.min(hit.offset, stripped.length);
    newLine = stripped;
    for (const c of [...existing, { chord, index: strippedOffset }].sort(
      (a, b) => b.index - a.index,
    )) {
      newLine = newLine.slice(0, c.index) + `(${c.chord})` + newLine.slice(c.index);
    }
  }
  storedLines[li] = newLine;
  const newLyrics = storedLines.join("\n");

  // Where the new label landed: everything before it renders identically to
  // before the insert, so the first point the old and new rows diverge is
  // exactly where the inserted label begins. When this line had no chords at
  // all before now, there was no old row to diverge from — the whole new row
  // is the label, so its end is simply the row's length.
  const after = renderOneLine(newLine, render);
  const newRow = after[0];
  const labelEnd =
    before.length === 2
      ? (() => {
          const oldRow = before[0];
          let d = 0;
          while (d < oldRow.length && d < newRow.length && oldRow[d] === newRow[d]) d++;
          return d + render(chord).length;
        })()
      : newRow.length;

  let boxCursor = 0;
  for (const line of buildChordRowLayout(newLyrics, render)) {
    if (line.storedLine === li && line.kind === "row") {
      return { lyrics: newLyrics, caret: boxCursor + labelEnd };
    }
    boxCursor += line.text.length + 1;
  }
  return { lyrics: newLyrics, caret: inlineToChordRows(newLyrics, render).length };
}

/**
 * Split the line the caret is on, the way Enter does — but on the STORED
 * lyrics, so the chords go with the words.
 *
 * Left to the browser, Enter only ever splits the box line the caret is in.
 * That line is the lyric row; the chord row above it is a separate line and
 * stays whole, still attached to the first half. Every chord past the break
 * then reads back onto the wrong words — which is the bug this exists to fix.
 *
 * Instead the caret is mapped back to a column in the stored line, the line is
 * split there, and each chord goes with the half its word went to. Returns null
 * when the caret isn't somewhere this can act on, meaning the caller should let
 * the browser insert the newline itself.
 */
export function breakLineAtBoxOffset(
  lyrics: string,
  boxOffset: number,
  render: (chord: string) => string = (c) => c,
): { lyrics: string; caret: number } | null {
  let cursor = 0;
  let hit: { line: RowLayoutLine; offset: number } | null = null;
  for (const line of buildChordRowLayout(lyrics, render)) {
    const end = cursor + line.text.length;
    if (boxOffset <= end) {
      hit = { line, offset: Math.max(0, boxOffset - cursor) };
      break;
    }
    cursor = end + 1; // +1 for the newline the join() will have put here
  }
  // The synthetic blank separating an instrumental break from the lyric after
  // it belongs to no stored line, so there is nothing here to split.
  if (!hit || hit.line.storedLine === null) return null;

  const li = hit.line.storedLine;
  const storedLines = lyrics.split("\n");
  const { text: stripped, chords } = parseRawChordLine(storedLines[li]);

  if (chords.length === 0) {
    // No chords means the box line is the stored line verbatim, so the offset
    // is already a position in it.
    const col = Math.min(hit.offset, storedLines[li].length);
    storedLines.splice(li, 1, storedLines[li].slice(0, col), storedLines[li].slice(col));
  } else {
    // A chord row's columns line up with the lyric beneath it, so the caret
    // maps onto the stripped text from either row.
    const col = Math.min(hit.offset, stripped.length);
    const splice = (text: string, cs: ChordAnchor[]) =>
      [...cs]
        .sort((a, b) => b.index - a.index)
        .reduce((out, c) => out.slice(0, c.index) + `(${c.chord})` + out.slice(c.index), text);
    // A chord sitting exactly on the break is anchored to the character that
    // moved down, so it moves too. Breaking at the very end of a line is the
    // exception: nothing moved, so no chord does either — including a trailing
    // chord parked past the last character.
    const movesDown = (c: ChordAnchor) => col < stripped.length && c.index >= col;
    storedLines.splice(
      li,
      1,
      splice(
        stripped.slice(0, col),
        chords.filter((c) => !movesDown(c)),
      ),
      splice(
        stripped.slice(col),
        chords.filter(movesDown).map((c) => ({ ...c, index: c.index - col })),
      ),
    );
  }

  const newLyrics = storedLines.join("\n");

  // Caret lands where typing continues: the start of the new line's lyric,
  // below its chord row rather than on it.
  let boxCursor = 0;
  for (const line of buildChordRowLayout(newLyrics, render)) {
    if (line.storedLine === li + 1 && line.kind !== "row") {
      return { lyrics: newLyrics, caret: boxCursor };
    }
    boxCursor += line.text.length + 1;
  }
  return { lyrics: newLyrics, caret: newLyrics.length };
}

/**
 * Remove every chord from the stored line the caret sits in — the palette's
 * "clear this line" button. Leaves the lyric text and every other line
 * untouched, and is a no-op both on a line with no chords to begin with and
 * on the synthetic blank line that separates an instrumental break from the
 * lyric after it (there is no stored line to attribute that blank to).
 */
export function clearChordsAtBoxOffset(
  lyrics: string,
  boxOffset: number,
  render: (chord: string) => string = (c) => c,
): { lyrics: string; caret: number } {
  const layout = buildChordRowLayout(lyrics, render);

  let cursor = 0;
  let li: number | null = null;
  for (const line of layout) {
    const end = cursor + line.text.length;
    if (boxOffset <= end) {
      li = line.storedLine;
      break;
    }
    cursor = end + 1;
  }
  if (li === null) return { lyrics, caret: boxOffset };

  const storedLines = lyrics.split("\n");
  storedLines[li] = stripChordsRaw(storedLines[li]);
  const newLyrics = storedLines.join("\n");

  // Caret goes to the start of that line's now chord-less lyric text.
  let boxCursor = 0;
  for (const line of buildChordRowLayout(newLyrics, render)) {
    if (line.storedLine === li) return { lyrics: newLyrics, caret: boxCursor };
    boxCursor += line.text.length + 1;
  }
  return { lyrics: newLyrics, caret: newLyrics.length };
}

/**
 * Read the editor's chord-sheet view back into inline chords.
 *
 * Columns alone are not enough to recover the anchors: a wide label followed by
 * a close one gets nudged right to keep the two readable, so re-deriving from
 * the row would shift those chords a character or two on the very first
 * keystroke — typing a single space next to a chord, without touching the lyric
 * or which chords are on the row, would otherwise visibly move it. `previous` is
 * the stored text the box was rendered from, matched two ways: first an exact
 * (row, lyric) pair, which covers every untouched line; then, for a row whose
 * spacing changed but whose lyric and chord sequence didn't, the line that
 * produced that same lyric + sequence — a whitespace-only edit is a no-op.
 * Only a line where the lyric or the chords themselves actually changed is
 * re-derived from raw columns.
 */
export function readChordRows(box: string, previous: string, opts: ChordRowOpts = {}): string {
  const render = opts.render ?? ((c: string) => c);
  const read = opts.read ?? ((t: string) => t);
  const rowOpts = { numbers: opts.numbers === true };

  const exact = new Map<string, string>();
  const bySequence = new Map<string, string>();
  for (const line of previous.split("\n")) {
    const rendered = renderOneLine(line, render);
    exact.set(rendered.join("\n"), line);
    if (rendered.length === 2) {
      const tokens = rendered[0].trim().split(/\s+/).filter(Boolean);
      bySequence.set(`${rendered[1]}\n${tokens.join(" ")}`, line);
    }
  }

  const lines = box.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const isRow = isChordRow(lines[i], rowOpts);
    const next = lines[i + 1];
    const pairs = isRow && next !== undefined && next.trim() !== "" && !isChordRow(next, rowOpts);
    const chunk = pairs ? `${lines[i]}\n${next}` : lines[i];

    const rememberedExact = exact.get(chunk);
    const bySequenceKey = pairs
      ? `${next}\n${lines[i].trim().split(/\s+/).filter(Boolean).join(" ")}`
      : undefined;
    const rememberedSequence =
      bySequenceKey !== undefined ? bySequence.get(bySequenceKey) : undefined;

    if (rememberedExact !== undefined) {
      out.push(rememberedExact);
    } else if (rememberedSequence !== undefined) {
      out.push(rememberedSequence);
    } else {
      out.push(chordRowsToInline(chunk, { ...opts, read }));
    }
    if (pairs) i++;
  }
  return out.join("\n");
}

/**
 * Whether the text uses the one-chord-per-line layout that WorshipTogether,
 * SongSelect and similar sites produce when copied: each chord on its own line
 * with the lyric split into runs around it.
 *
 * The tell is a lyric run left hanging on a trailing space. That space is the
 * gap before the next word, so it means the chord that follows sits *inside*
 * that line rather than starting the next one.
 */
export function looksLikeChordStream(text: string): boolean {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let hits = 0;
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    if (!isChordRow(lines[i])) continue;
    if (prev.trim() !== "" && !isChordRow(prev) && /\s$/.test(prev)) hits++;
  }
  return hits >= 2;
}

/** Fold the one-chord-per-line layout into the inline bracket format. */
export function chordStreamToInline(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let buf = "";

  const flush = () => {
    const line = buf.replace(/\s+$/, "");
    if (line) out.push(line);
    buf = "";
  };

  for (const raw of lines) {
    if (raw.trim() === "") {
      flush();
      continue;
    }
    if (isChordRow(raw)) {
      // The run before this one ended cleanly, so the chord opens a new line.
      if (buf !== "" && !/\s$/.test(buf)) flush();
      buf += raw
        .trim()
        .split(/\s+/)
        .map((c) => `(${c})`)
        .join("");
      continue;
    }
    const labelled = bracketSectionLabel(raw);
    if (labelled !== raw) {
      flush();
      out.push(labelled);
      continue;
    }
    buf += raw;
  }
  flush();
  return out.join("\n");
}

/** A ChordPro directive line: `{title: ...}`, `{soc}`, `{comment: ...}`. */
const CHORDPRO_DIRECTIVE = /^\s*\{\s*([a-z_0-9]+)\s*(?::\s*([^}]*))?\}\s*$/i;

/** ChordPro's section directives, and the label each one opens. */
const CHORDPRO_SECTIONS: Record<string, string> = {
  soc: "Chorus",
  start_of_chorus: "Chorus",
  sov: "Verse",
  start_of_verse: "Verse",
  sob: "Bridge",
  start_of_bridge: "Bridge",
  sop: "Pre-Chorus",
  start_of_part: "Part",
};

/**
 * Whether the text is ChordPro — chords in square brackets, anchored to the
 * syllable that follows, usually with `{directive}` lines around them.
 *
 * The tell has to be a bracket *inside* a line, because a bracket alone on its
 * own line is how this app writes a section label, and "[C]" is both a
 * plausible shorthand for a chorus and a perfectly good chord. Two of them, so
 * one stray "[A]" in a lyric can't rewrite somebody's song.
 */
export function looksLikeChordPro(text: string): boolean {
  let inline = 0;
  for (const line of text.split("\n")) {
    if (CHORDPRO_DIRECTIVE.test(line)) continue;
    for (const m of line.matchAll(/\[([^\][]*)\]/g)) {
      if (isChordToken(m[1]) && m[0].trim() !== line.trim()) inline++;
    }
  }
  return inline >= 2;
}

/**
 * Fold ChordPro into the inline bracket format.
 *
 * The chords themselves are a straight bracket swap — both formats anchor a
 * chord to the character that follows it. The directives are the awkward part:
 * they carry a song's structure, so the section ones become the app's own
 * labels, and the rest (title, key, tempo, chord definitions) are metadata the
 * lyric box has no place for and are dropped.
 */
export function chordProToInline(text: string): string {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*#/.test(raw)) continue; // ChordPro's own comment syntax
    const directive = CHORDPRO_DIRECTIVE.exec(raw);
    if (directive) {
      const name = directive[1].toLowerCase();
      const arg = (directive[2] ?? "").trim();
      const section = CHORDPRO_SECTIONS[name];
      if (section) out.push(`[${arg || section}]`);
      // Files that carry no section directives at all tend to use a comment as
      // the section heading instead, so it reads back as one.
      else if ((name === "c" || name === "comment") && arg) out.push(`[${arg}]`);
      continue;
    }
    out.push(
      raw.replace(/\[([^\][]*)\]/g, (whole, token) => (isChordToken(token) ? `(${token})` : whole)),
    );
  }
  return out.join("\n").trim();
}

/**
 * The key a ChordPro file declares in its `{key: ...}` directive, or `null` if
 * it doesn't carry one.
 *
 * A file that states its key should be trusted rather than re-derived: it's
 * what the person who wrote the chart actually played it in, which
 * `guessKey`'s frequency count over the chords in the lyrics can only ever
 * approximate. Kept separate from `chordProToInline` because that function
 * returns lyric text, and a key isn't lyric text — the paste handler asks for
 * this only when it's about to build a fresh `SongChords` config.
 */
export function chordProKey(text: string): string | null {
  for (const line of text.split("\n")) {
    const directive = CHORDPRO_DIRECTIVE.exec(line);
    if (directive && directive[1].toLowerCase() === "key" && directive[2]) {
      const key = normaliseKeyTag(directive[2].trim());
      if (key) return key;
    }
  }
  return null;
}

/**
 * Fold any recognised chord-sheet layout into the inline bracket format, so the
 * rest of the app only ever deals with one representation. Text that isn't
 * chord-shaped comes back untouched, making this safe to run over any paste.
 */
export function normaliseChordSheet(text: string): string {
  if (looksLikeChordPro(text)) return chordProToInline(text);
  if (looksLikeChordStream(text)) return chordStreamToInline(text);
  if (looksLikeChordSheet(text)) return chordRowsToInline(text);
  return text;
}

/**
 * Whether a block of text is worth running `chordRowsToInline` over. Requires
 * two or more chord rows: a real chord sheet always has several, whereas a
 * plain lyric only ever trips `isChordRow` by accident on a one-word line such
 * as "A", and one stray match shouldn't rewrite someone's lyrics.
 */
export function looksLikeChordSheet(text: string): boolean {
  // Wrapped rather than passed by reference: filter would hand the index in as
  // the options argument.
  return text.split("\n").filter((line) => isChordRow(line)).length >= 2;
}

/** Merge one column-positioned chord row onto the lyric line beneath it. */
function mergeChordRow(
  row: string,
  lyric: string,
  snap: boolean,
  read: (token: string) => string,
): string {
  const anchors: { col: number; chord: string }[] = [];
  for (const m of row.matchAll(/\S+/g)) anchors.push({ col: m.index, chord: m[0] });

  const taken = new Set<number>();
  const placed: { col: number; chord: string }[] = [];

  for (const a of anchors) {
    const chord = read(a.chord);
    let col = Math.min(a.col, lyric.length);
    if (!snap) {
      // Exact column, which is what makes our own output round-trip.
      placed.push({ col, chord });
      continue;
    }
    if (col < lyric.length && /\s/.test(lyric[col])) {
      // Sitting in a gap: slide forward onto the next word.
      while (col < lyric.length && /\s/.test(lyric[col])) col++;
    } else {
      // Sitting inside a word: snap back to its first letter, since chord-sheet
      // alignment is approximate and a chord over "You|r" means "Your".
      let start = col;
      while (start > 0 && !/\s/.test(lyric[start - 1])) start--;
      // Unless an earlier chord already claimed that word, in which case a real
      // mid-word change was intended and the exact column is kept.
      if (!taken.has(start)) col = start;
    }
    taken.add(col);
    placed.push({ col, chord });
  }

  let out = lyric;
  // Insert right-to-left so the earlier offsets stay valid.
  for (const p of [...placed].sort((x, y) => y.col - x.col)) {
    out = out.slice(0, p.col) + `(${p.chord})` + out.slice(p.col);
  }
  return out;
}

/**
 * Convert an Ultimate Guitar style chord sheet, where chords sit on their own
 * line positioned by column above the lyric, into the inline bracket format.
 * Text with no chord rows is returned unchanged, so this is safe to run over
 * any paste.
 */
export function chordRowsToInline(text: string, opts: ChordRowOpts = {}): string {
  const snap = opts.snap ?? true;
  const read = opts.read ?? ((t: string) => t);
  const rowOpts = { numbers: opts.numbers === true };
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const row = lines[i];
    if (!isChordRow(row, rowOpts)) {
      out.push(bracketSectionLabel(row));
      continue;
    }
    const next = lines[i + 1];
    if (next === undefined || next.trim() === "" || isChordRow(next, rowOpts)) {
      // Nothing to sit above: an instrumental break in its own right.
      out.push(
        row
          .trim()
          .split(/\s+/)
          .map((c) => `(${read(c)})`)
          .join(" "),
      );
      continue;
    }
    out.push(mergeChordRow(row, next, snap, read));
    i++; // the lyric line has been folded in
  }
  return out.join("\n");
}

export interface ChordSegment {
  /** Chord sitting above this segment, already rendered for display. */
  chord?: string;
  text: string;
  /** Followed by a space — the renderer emits a real one so the line can wrap. */
  space: boolean;
}

/**
 * Break a parsed line into the columns a chord sheet renders: each segment is a
 * run of text with at most one chord above it. Segments also break at spaces so
 * the browser keeps its line-wrap opportunities between words.
 */
export function toChordSegments(
  parsed: ParsedChordLine,
  render: (chord: string) => string = (c) => c,
): ChordSegment[] {
  const at = new Map<number, string[]>();
  for (const c of parsed.chords) {
    const list = at.get(c.index);
    if (list) list.push(c.chord);
    else at.set(c.index, [c.chord]);
  }
  const label = (i: number) => at.get(i)?.map(render).join(" ");

  const segs: ChordSegment[] = [];
  let cur: ChordSegment | null = null;

  for (let i = 0; i < parsed.text.length; i++) {
    const ch = parsed.text[i];
    if (ch === " ") {
      if (cur) {
        cur.space = true;
        segs.push(cur);
        cur = null;
      } else if (segs.length) {
        segs[segs.length - 1].space = true;
      }
      continue;
    }
    if (!cur || at.has(i)) {
      if (cur) segs.push(cur);
      cur = { chord: label(i), text: "", space: false };
    }
    cur.text += ch;
  }
  if (cur) segs.push(cur);

  const tail = label(parsed.text.length);
  if (tail) {
    // A chord past the end of the line still needs a gap after the last word.
    if (segs.length) segs[segs.length - 1].space = true;
    segs.push({ chord: tail, text: "", space: false });
  }
  return segs;
}
