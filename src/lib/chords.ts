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
  /** Key the chords were written in. Required to render numbers or transpose. */
  key: string;
  /** How chords render wherever they're visible. */
  display: ChordDisplay;
  /** `display: "letters"` only — render transposed into this key. Defaults to `key`. */
  showInKey?: string;
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

/** Render a chord token the way the song is configured to display it. */
export function renderChord(token: string, cfg: SongChords): string {
  if (cfg.display === "numbers") return chordToNumber(token, cfg.key);
  return transposeChord(token, cfg.key, cfg.showInKey || cfg.key);
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
