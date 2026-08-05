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

/**
 * Translate a caret offset in the chord-hidden view back to the matching offset
 * in the full text, so an edit made against the visible text lands in the right
 * place in what is actually stored.
 */
export function fullOffsetOf(full: string, visibleOffset: number): number {
  let seen = 0;
  let i = 0;
  while (i < full.length && seen < visibleOffset) {
    if (full[i] === "(") {
      const close = full.indexOf(")", i + 1);
      if (close > i && isChordToken(full.slice(i + 1, close))) {
        i = close + 1;
        continue;
      }
    }
    i++;
    seen++;
  }
  return i;
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

  // Pair lines that survived verbatim, then fill the gaps between those anchors
  // positionally so an edited line still inherits from the line it came from.
  const lineMap = lcsMap(oldStripped, newLines);
  const inheritsFrom: number[] = new Array(newLines.length).fill(-1);
  let oi = 0;
  let nj = 0;
  const fillGap = (oEnd: number, nEnd: number) => {
    for (let k = 0; oi + k < oEnd && nj + k < nEnd; k++) inheritsFrom[nj + k] = oi + k;
  };
  lineMap.forEach((j, i) => {
    if (j < 0) return;
    fillGap(i, j);
    inheritsFrom[j] = i;
    oi = i + 1;
    nj = j + 1;
  });
  fillGap(oldStripped.length, newLines.length);

  return newLines
    .map((line, j) => (inheritsFrom[j] < 0 ? line : reanchorLine(oldLines[inheritsFrom[j]], line)))
    .join("\n");
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

/**
 * Best guess at the key a song was written in: the root of its first chord.
 * Only ever used to seed the editor's key picker, which the leader can change.
 */
export function guessKey(text: string): string | null {
  for (const line of text.split("\n")) {
    const first = parseChordLine(line).chords[0];
    if (!first) continue;
    const root = parseChord(first.chord)?.root;
    const pitch = root ? pitchOf(root) : null;
    if (pitch !== null) return KEYS[pitch];
  }
  return null;
}

/**
 * True when every token on a line is a chord: an Ultimate Guitar style chord
 * row sitting above its lyric, or a standalone instrumental line.
 */
export function isChordRow(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(isChordToken);
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

/**
 * Fold any recognised chord-sheet layout into the inline bracket format, so the
 * rest of the app only ever deals with one representation. Text that isn't
 * chord-shaped comes back untouched, making this safe to run over any paste.
 */
export function normaliseChordSheet(text: string): string {
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
  return text.split("\n").filter(isChordRow).length >= 2;
}

/** Merge one column-positioned chord row onto the lyric line beneath it. */
function mergeChordRow(row: string, lyric: string): string {
  const anchors: { col: number; chord: string }[] = [];
  for (const m of row.matchAll(/\S+/g)) anchors.push({ col: m.index, chord: m[0] });

  const taken = new Set<number>();
  const placed: { col: number; chord: string }[] = [];

  for (const a of anchors) {
    let col = Math.min(a.col, lyric.length);
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
    placed.push({ col, chord: a.chord });
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
export function chordRowsToInline(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const row = lines[i];
    if (!isChordRow(row)) {
      out.push(bracketSectionLabel(row));
      continue;
    }
    const next = lines[i + 1];
    if (next === undefined || next.trim() === "" || isChordRow(next)) {
      // Nothing to sit above: an instrumental break in its own right.
      out.push(
        row
          .trim()
          .split(/\s+/)
          .map((c) => `(${c})`)
          .join(" "),
      );
      continue;
    }
    out.push(mergeChordRow(row, next));
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
