/**
 * Converts the OpenSong English worship song database to a compact JSON search
 * index for the app. Run once whenever the source database is updated.
 *
 * Usage:
 *   node scripts/build-songs.mjs [path-to-en-folder]
 *
 * Defaults to /Users/valiantchan/Downloads/en
 * Outputs to public/songs-en.json (relative to project root / cwd)
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chordRowsToInline, isChordRow, stripChords } from "../src/lib/chords.ts";

// Maps lowercase OpenSong section prefixes → display labels.
// Numbered variants (V1, V2) get the number appended only for Verse/Pre-Chorus.
const SECTION_PREFIX = {
  v: "Verse",
  verse: "Verse",
  c: "Chorus",
  chorus: "Chorus",
  b: "Bridge",
  bridge: "Bridge",
  p: "Pre-Chorus",
  pc: "Pre-Chorus",
  t: "Tag",
  tag: "Tag",
  i: "Intro",
  intro: "Intro",
  o: "Outro",
  outro: "Outro",
  ending: "Outro",
  outtro: "Outro",
  refrain: "Refrain",
  interlude: "Interlude",
  instrumental: "Interlude",
  break: "Interlude",
  adlib: "Tag",
};

// Whether a section type gets its number shown (Verse 1, Verse 2 etc.)
const NUMBERED = new Set(["Verse", "Pre-Chorus"]);

function convertMarker(raw) {
  // raw is like "[V1]", "[Chorus]", "[B2]", "[INTRO]"
  const inner = raw.slice(1, -1).toLowerCase();

  // letter(s) + optional digits, e.g. "v1", "c2", "b3", "pc1"
  const m = inner.match(/^([a-z]+?)(\d+)?$/);
  if (!m) return null;
  const [, letters, num] = m;
  const label = SECTION_PREFIX[letters];
  if (!label) return null;
  if (num && NUMBERED.has(label)) return `[${label} ${num}]`;
  return `[${label}]`;
}

// Matches redundant inline section label lines like "Verse 1:", "Chorus:", "Bridge: x3", "2 Bridge:"
const LABEL_RE =
  /^(\d+\s+)?(verse|chorus|bridge|pre-?chorus|intro|outro|outtro|ending|tag|interlude|refrain|bridge)\s*(\d+)?\s*:?\s*(x\d+)?$/i;

/**
 * OpenSong marks a chord row with a leading "." (some exports also wrap each
 * chord in its own parens, e.g. ".(B)  (G#m)"). Both the dot and any parens are
 * replaced with a single space each — never removed — so every other character
 * keeps its column, which is what lets chordRowsToInline's word-anchoring land
 * a chord over the right syllable in the lyric line beneath it.
 */
function normaliseChordRows(raw) {
  return raw
    .split("\n")
    .map((line) => {
      if (!/^\s*\./.test(line)) return line;
      const dotIdx = line.indexOf(".");
      const cleaned = (line.slice(0, dotIdx) + " " + line.slice(dotIdx + 1)).replace(/[()]/g, " ");
      // A dot row that won't parse as chords is chart furniture: bar lines,
      // repeat counts, sequences like "Bsus4-A" or "Em - G". Drop it outright.
      // Left in, it survives as a lyric line and ends up on the projector.
      return isChordRow(cleaned) ? cleaned : null;
    })
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Chord charts split a word across a chord change with a dash — "hallelu -
 * (G)jah", "even (D)- ing". The dash is a typesetting artefact of the chord
 * landing mid-word, so once that chord is inline the dash has done its job:
 * dropping it restores "hallelu(G)jah". Only dashes touching a chord go; a
 * dash between two whole words is real punctuation and is left alone.
 */
function joinMelismaDashes(line) {
  return (
    line
      // "hallelu - (G)jah" and "even (D)- ing" — the chord may sit either side
      // of the dash. Whitespace around it goes too: the word was only broken up
      // to make room for the chord in a column-aligned chart.
      .replace(/(\w)\s*-\s*(\([^()\s]+\))\s*(\w)/g, "$1$2$3")
      .replace(/(\w)\s*(\([^()\s]+\))\s*-\s*(\w)/g, "$1$2$3")
      // Column padding leaves runs of spaces behind once the chords are inline.
      .replace(/ {2,}/g, " ")
  );
}

/**
 * OpenSong marks a syllable stretched across notes with underscores
 * ("forever__mor__e") — meaningless once the words are only sung, not read —
 * and sentence punctuation is the same kind of noise on a slide. Both are
 * dropped outright rather than turned into a space: neither ever separates
 * words that need to stay apart, so removing them reconstructs the plain word
 * ("forever__mor__e!____" → "forevermore"). Never touches a chord's own "()"
 * or a section marker's "[]" — none of these characters appear in a valid
 * chord token, so there's nothing here that could land inside one.
 */
function stripNoise(line) {
  return (
    line
      .replace(/_/g, "")
      .replace(/[,;:.!?]/g, "")
      // A bar line never belongs in a lyric. Whole bar-line rows are dropped as
      // furniture; this catches the stray one left on the end of a real line
      // ("I'm goin home |"), where the rest of the line is genuinely sung.
      .replace(/\|/g, " ")
      .replace(/ {2,}/g, " ")
      .trim()
  );
}

// German/Nordic charts write B as H, and "NC" marks a no-chord beat. Neither is
// a chord this codebase recognises, but both appear in bar-line notation, so
// furniture detection has to tolerate them or it misses whole charts.
const FURNITURE_EXTRAS = /^(h|hm|h7|hm7|nc|n\.c\.)$/i;

/**
 * Bar-line chord charts ("| F# | G# A#m | C#/F |", "E /// H | C#m7 /// A") and
 * bare chord sequences ("Intro B - F# - C#", "A - F#m - D - A (2x)") are
 * notation for the band, not words anyone sings. They survive into the lyrics
 * because they aren't dot-prefixed in the source, so normaliseChordRows never
 * sees them, and end up projected on screen.
 *
 * Detected by stripping the notation scaffolding — bars, beat slashes, repeat
 * counts, a leading section label — and asking whether what's left is nothing
 * but chords. A real lyric that happens to carry a stray bar ("I'm goin home |")
 * keeps words behind after the strip, so it survives.
 */
function isChartFurniture(line) {
  const t = line.trim();
  if (!t) return false;
  const bare = t
    .replace(/\|/g, " ")
    .replace(/\//g, " ")
    .replace(/\(\s*(?:play\s*)?\d+\s*(?:x|times)?\s*\)/gi, " ")
    // The trailing colon matters: sources write "Intro: B - F# - C#", and the
    // colon only gets stripped later by stripNoise, long after this runs.
    .replace(/^\s*(intro|outro|instrumental|instr|solo|turnaround|vamp|ending)\s*\d*\s*:?/i, " ")
    .replace(/\s*-\s*/g, " ")
    .trim();
  // Nothing but scaffolding: only furniture if it actually had bars in it, so a
  // bare section label ("Bridge") isn't swallowed here.
  if (!bare) return t.includes("|");
  const tokens = bare.split(/\s+/).filter(Boolean);
  return tokens.every((w) => isChordRow(w) || FURNITURE_EXTRAS.test(w));
}

function cleanLyrics(raw) {
  const lines = chordRowsToInline(normaliseChordRows(raw)).split("\n");
  const out = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Skip blank lines — they were chord-group separators and are meaningless after stripping
    if (!trimmed) continue;

    // A stray chord row chordRowsToInline couldn't merge (e.g. an oddity like
    // "N.C." mixed with real chords) — drop it rather than leak a raw dot line.
    if (trimmed.startsWith(".")) continue;

    // Section markers like [V1], [C2], [Chorus]
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      const converted = convertMarker(trimmed);
      if (converted) {
        // Blank separator before each section (not before the very first one)
        if (out.length > 0) out.push("");
        out.push(converted);
      }
      continue;
    }

    // Redundant label lines ("Verse 1:", "Chorus:", "Bridge: x3")
    if (LABEL_RE.test(trimmed)) continue;

    // Bar-line charts and bare chord sequences — notation, not lyrics.
    if (isChartFurniture(trimmed)) continue;

    // Lyric line — append directly with no blank lines within the section
    const cleaned = stripNoise(joinMelismaDashes(trimmed));
    if (cleaned) out.push(cleaned);
  }

  return out.join("\n").trim();
}

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", apos: "'", quot: '"' };
// Single pass so an already-escaped "&amp;lt;" decodes to "&lt;", not "<"
// (decoding &amp; before &lt; would double-unescape).
function decodeXmlEntities(s) {
  return s.replace(/&(amp|lt|gt|apos|quot);/g, (_, e) => XML_ENTITIES[e]);
}

function extractField(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? decodeXmlEntities(m[1].trim()) : "";
}

// Collapse anything but letters/digits, for matching titles that differ only
// in punctuation or case ("You're Worthy" vs "Youre worthy").
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The source database has always had duplicate exports of the same song —
 * distinct files, same title and author.
 *
 * Matching on title and author alone is not enough: unrelated songs share
 * titles ("Rescue" appears three times, "Amazing Grace" is both the hymn and a
 * modern song), and collapsing those would silently lose one. So entries only
 * merge when their *lyrics* agree too, compared with chords stripped and
 * punctuation flattened — which is exactly what makes a chorded export and a
 * plain one of the same song collapse into the chorded one.
 *
 * Within a matched group the winner is whichever has the most going for it:
 * chords, then a tagged key, then longer lyrics. Ties fall back to filename
 * order, so rebuilding from the same source is deterministic.
 */
function dedupe(songs) {
  const best = new Map();
  for (const s of songs) {
    const key = `${norm(s.title)}|${norm(s.artist)}|${norm(stripChords(s.lyrics))}`;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, s);
      continue;
    }
    const score = (x) => (x.hasChords ? 2 : 0) + (x.key ? 1 : 0);
    if (
      score(s) > score(prev) ||
      (score(s) === score(prev) && s.lyrics.length > prev.lyrics.length)
    ) {
      best.set(key, s);
    }
  }
  return [...best.values()];
}

// Normalised for CONTENT matching, deliberately looser than `norm()`: every
// parenthetical is stripped (not just chords — a stray "(Intro)" or "(x2)"
// would otherwise make two exports of the same song look different), and
// section markers go too, since one export labelling "[Chorus]" and another
// not shouldn't be the reason two copies of the same song don't match.
function normaliseForContentMatch(text) {
  return text
    .replace(/\([^()]*\)/g, "")
    .replace(/^\s*\[[^\]]+\]\s*$/gm, "")
    .toLowerCase()
    .replace(/[^a-z0-9\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein distance, single-row DP — O(n·m) time, O(min(n,m)) space.
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// 1 = identical, 0 = nothing in common — same shape as Python's
// difflib.SequenceMatcher.ratio(), used to validate this threshold.
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}

const SIMILARITY_THRESHOLD = 0.85;

/**
 * The OpenSong source catalogues the same song under multiple titles far more
 * often than under the same one: a source church's prefix ("Bergsig: How
 * Great is our God" next to "How Great Is Our God"), a nickname or first-line
 * title ("Refiner's Fire" / "Purify My Heart"), a mangled filename-derived
 * title, a spelling variant. None of that is caught by `dedupe()`, which
 * requires the title to already match.
 *
 * Songs are bucketed by the first 40 characters of their content-normalised
 * lyrics — cheap, and enough to keep genuinely different songs from ever being
 * compared — then compared pairwise within a bucket. Chains (A matches B, B
 * matches C, but A and C fall in different buckets and are never compared
 * directly) are grouped with union-find rather than merged pairwise, so a
 * three-way duplicate collapses to one winner instead of two.
 *
 * The winner is whichever copy has an artist credited — the un-credited copy
 * is, in every case checked, the source-prefixed one — then the same
 * chords/key/length scoring `dedupe()` already uses.
 */
function dedupeByContent(songs) {
  const keys = songs.map((s) => normaliseForContentMatch(s.lyrics));
  const parent = songs.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i, j) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  const buckets = new Map();
  for (let i = 0; i < songs.length; i++) {
    if (keys[i].length < 40) continue; // too short to fingerprint reliably
    const k = keys[i].slice(0, 40);
    (buckets.get(k) ?? buckets.set(k, []).get(k)).push(i);
  }

  let pairs = 0;
  for (const bucket of buckets.values()) {
    for (let a = 0; a < bucket.length; a++) {
      for (let b = a + 1; b < bucket.length; b++) {
        const i = bucket[a];
        const j = bucket[b];
        if (norm(songs[i].title) === norm(songs[j].title)) continue; // dedupe()'s job
        if (similarity(keys[i], keys[j]) >= SIMILARITY_THRESHOLD) {
          union(i, j);
          pairs++;
        }
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < songs.length; i++) {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)).push(i);
  }

  const score = (x) => (x.artist.trim() ? 4 : 0) + (x.hasChords ? 2 : 0) + (x.key ? 1 : 0);
  const winners = [];
  for (const idxs of groups.values()) {
    let best = idxs[0];
    for (const i of idxs.slice(1)) {
      if (
        score(songs[i]) > score(songs[best]) ||
        (score(songs[i]) === score(songs[best]) &&
          songs[i].lyrics.length > songs[best].lyrics.length)
      ) {
        best = i;
      }
    }
    winners.push(songs[best]);
  }

  return { winners, merged: songs.length - winners.length, pairs };
}

/**
 * Every word in the database that appears on a line with no dash on it. Used to
 * settle what a dash means, so it must be built only from dash-free lines: a
 * vocabulary that included the artifacts would happily vouch for them.
 */
function buildVocabulary(songs) {
  const vocab = new Set();
  for (const s of songs) {
    for (const line of s.lyrics.split("\n")) {
      if (line.includes("-")) continue;
      const plain = line.replace(/\([^()]*\)/g, "");
      for (const w of plain.match(/[A-Za-z']+/g) ?? []) vocab.add(w.toLowerCase());
    }
  }
  return vocab;
}

// A word fragment, then any chords hugging it, then a dash with whitespace on
// at least one side, then more chords, then the next fragment. Requiring that
// whitespace is what protects a genuine hyphenated word: "whirl-wind's" has
// none, so it is never touched.
const SPLIT_DASH_RE =
  /([A-Za-z']+)((?:\s*\([^()\s]*\))*)(?:\s+-\s*|\s*-\s+)((?:\([^()\s]*\)\s*)*)([A-Za-z']+)/g;

// A hyphen welded between two letters, with no space either side.
const WELDED_DASH_RE = /\b([A-Za-z]+)-([A-Za-z]+)\b/g;

/**
 * Resolve the dashes chord charts leave behind.
 *
 * A word split across a chord change ("victo - ry", "o - ver", "con - fessed")
 * has to be rejoined; a real dash between two whole words ("Oh God - there was
 * no peace") has to become a plain space. Telling them apart needs to know
 * whether the two fragments form a word, and the corpus itself answers that:
 * "victory" occurs 244 times elsewhere in the database, "godthere" never.
 *
 * Chords sitting either side of the dash are carried through untouched, so
 * "hallelu (G)- (Gsus)jah" closes up to "hallelu(G)(Gsus)jah" rather than
 * losing its chord placement.
 */
function resolveDashes(text, vocab) {
  return text
    .split("\n")
    .map((line) => {
      // "1- Each cooing dove" — a verse number welded to the first word.
      let out = line.replace(/^\s*\d+\s*-\s*/, "");
      // Some sources escape the dash; normalise before matching.
      out = out.replace(/\\-/g, "-");
      out = out.replace(SPLIT_DASH_RE, (whole, left, lc, rc, right) => {
        const joined = (left + right).toLowerCase().replace(/'/g, "");
        return vocab.has(joined)
          ? `${left}${lc}${rc}${right}`.replace(/\s+/g, "")
          : `${left}${lc} ${rc}${right}`;
      });
      // The same split can also reach us with its spaces already collapsed
      // ("Re-demption", "jour-ney", "Sa-vior"), which looks exactly like a real
      // compound word. The corpus test alone isn't enough here, so it gets one
      // extra guard: a genuine compound has both halves as words in their own
      // right ("ever-living", "first-born", "nail-scarred"), a split word does
      // not. Only joining when that guard fails leaves real compounds intact.
      out = out.replace(WELDED_DASH_RE, (whole, a, b) => {
        const bothWords = vocab.has(a.toLowerCase()) && vocab.has(b.toLowerCase());
        return vocab.has((a + b).toLowerCase()) && !bothWords ? a + b : whole;
      });
      // Whatever the join pass didn't claim is a leftover: a dash dangling off
      // the end of a line, opening one, trailing a chord ("(A)- (E)cean"), or
      // part of an arrow ("->chorus"). None of them are sung, so they all
      // become a space. The rule is simply that a dash survives only when it is
      // welded between two letters, which is exactly a real hyphenated word
      // ("whirl-wind's", "self-control") and nothing else.
      out = out.replace(/(?<![A-Za-z])-+|-+(?![A-Za-z])/g, " ");
      return out.replace(/ {2,}/g, " ").trim();
    })
    .join("\n");
}

async function main() {
  const srcDir = process.argv[2] ?? "/Users/valiantchan/Downloads/en";
  const outPath = join(process.cwd(), "public", "songs-en.json");

  console.log(`Reading from: ${srcDir}`);
  const files = await readdir(srcDir);

  const parsed = [];
  let errors = 0;

  for (const filename of files) {
    try {
      const content = await readFile(join(srcDir, filename), "utf-8");

      // Fall back to filename-derived title if <title> is absent
      const title =
        extractField(content, "title") ||
        filename.replace(/ i\d+$/, "").replace(/\b\w/g, (c) => c.toUpperCase());
      const artist = extractField(content, "author");
      const aka = extractField(content, "aka");
      const key = extractField(content, "key");
      const rawLyrics = extractField(content, "lyrics");

      const lyrics = rawLyrics ? cleanLyrics(rawLyrics) : "";
      const hasChords = /\([^()\s]+\)/.test(lyrics);

      parsed.push({ title, artist, aka, key, lyrics, hasChords });
    } catch {
      errors++;
    }
  }

  // Dashes are settled across the whole corpus at once, so this runs after
  // every song is parsed rather than inside cleanLyrics.
  const vocab = buildVocabulary(parsed);
  const dashesBefore = parsed.filter((s) => /\s-|-\s/.test(s.lyrics)).length;
  for (const s of parsed) s.lyrics = resolveDashes(s.lyrics, vocab);
  const dashesAfter = parsed.filter((s) => /\s-|-\s/.test(s.lyrics)).length;

  const deduped = dedupe(parsed);
  const { winners, merged, pairs } = dedupeByContent(deduped);
  const withChords = winners.filter((s) => s.hasChords).length;

  const songs = winners.map(({ title, artist, aka, key, lyrics }) => {
    const entry = { title, artist, lyrics };
    if (aka) entry.aka = aka;
    if (key) entry.key = key;
    return entry;
  });

  // Pretty-printed to match how the file is committed, so a rebuild produces a
  // reviewable diff rather than one 3 MB line. Costs ~3 KB gzipped over the wire.
  await writeFile(outPath, JSON.stringify(songs, null, 2));

  const kb = Math.round(Buffer.byteLength(JSON.stringify(songs), "utf-8") / 1024);
  console.log(
    `✓ ${songs.length} songs written to public/songs-en.json (${kb} KB uncompressed, ` +
      `dashes resolved in ${dashesBefore - dashesAfter} songs, ` +
      `${parsed.length - deduped.length} same-title duplicates dropped, ` +
      `${merged} cross-title duplicates merged (${pairs} pairs matched >= ${SIMILARITY_THRESHOLD}), ` +
      `${withChords} with chords, ${errors} errors)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
