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
  return line
    .replace(/_/g, "")
    .replace(/[,;:.!?]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
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

  const deduped = dedupe(parsed);
  const withChords = deduped.filter((s) => s.hasChords).length;

  const songs = deduped.map(({ title, artist, aka, key, lyrics }) => {
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
      `${parsed.length - deduped.length} duplicates dropped, ${withChords} with chords, ${errors} errors)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
