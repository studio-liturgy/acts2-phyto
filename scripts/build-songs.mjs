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

function cleanLyrics(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Skip blank lines — they were chord-group separators and are meaningless after stripping
    if (!trimmed) continue;

    // Skip chord lines (start with a dot)
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
    out.push(trimmed);
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

async function main() {
  const srcDir = process.argv[2] ?? "/Users/valiantchan/Downloads/en";
  const outPath = join(process.cwd(), "public", "songs-en.json");

  console.log(`Reading from: ${srcDir}`);
  const files = await readdir(srcDir);

  const songs = [];
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
      const rawLyrics = extractField(content, "lyrics");

      const lyrics = rawLyrics ? cleanLyrics(rawLyrics) : "";

      const entry = { title, artist, lyrics };
      if (aka) entry.aka = aka;
      songs.push(entry);
    } catch {
      errors++;
    }
  }

  await writeFile(outPath, JSON.stringify(songs));

  const kb = Math.round(Buffer.byteLength(JSON.stringify(songs), "utf-8") / 1024);
  console.log(
    `✓ ${songs.length} songs written to public/songs-en.json (${kb} KB uncompressed, ${errors} errors)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
