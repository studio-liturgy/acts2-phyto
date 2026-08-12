/**
 * Flags song sections that are probably in a language other than English, for
 * a human to review — it never edits the database itself.
 *
 * Usage:
 *   node scripts/find-non-english.mjs [path-to-songs.json]
 *
 * Defaults to public/songs-en.json. Requires a Unix word list at
 * /usr/share/dict/words (present by default on macOS and most Linux
 * distributions) — there's no bundled or networked alternative, so this only
 * runs where that file exists.
 *
 * How it decides: every [Verse]/[Chorus]/etc. block is checked on its own,
 * because a song can be genuinely bilingual — an English hymn with one
 * verse translated, or a call-and-response arrangement — and the right unit
 * to judge is the block, not the whole song. For each block, every word of
 * three or more letters is checked against a real English word list (with
 * light stemming, since the list has "redeem" but not "redeemed"), and a
 * worship-vocabulary supplement (proper nouns, transliterated Hebrew/Greek,
 * archaic pronouns, informal contractions) that a general dictionary won't
 * have. Vocalese ("ooh", "woah") and words under three letters are excluded
 * from the count entirely rather than treated as misses — they carry no
 * language signal either way, and short words in particular are shared by
 * chance across many languages ("la", "de", "e", "no").
 *
 * What this can't do reliably: tell an intentionally-adopted refrain word
 * ("Kumbaya", "Hallelujah") from a real foreign verse, judge whether a
 * substantially bilingual arrangement should be trimmed to just its English
 * half, or catch every melismatic respelling of a word already in the
 * vocabulary ("Adonnnnay" for "Adonai"). A first pass over this database hit
 * all three, plus false positives from vocalese-heavy bridges and archaic
 * spellings — which is why this stays a report, not an editor.
 */
import { stripChords } from "../src/lib/chords.ts";
import { readFile } from "node:fs/promises";

const DICT_PATH = "/usr/share/dict/words";
const MIN_WORDS = 6; // below this, too few data points to trust the ratio
const HIGH_CONFIDENCE = 0.3;
const BORDERLINE = 0.5;

const SUPPLEMENT = [
  "jesus",
  "christ",
  "yahweh",
  "jehovah",
  "emmanuel",
  "immanuel",
  "messiah",
  "hallelujah",
  "halleluia",
  "halleluiah",
  "alleluia",
  "alleluiah",
  "hallelu",
  "hosanna",
  "hosannah",
  "maranatha",
  "selah",
  "yah",
  "kyrie",
  "eleison",
  "abba",
  "elohim",
  "adonai",
  "yeshua",
  "zion",
  "sion",
  "hades",
  "gehenna",
  "sheol",
  "calvary",
  "golgotha",
  "bethlehem",
  "nazareth",
  "galilee",
  "jerusalem",
  "israel",
  "judah",
  "pentecost",
  "shalom",
  "amen",
  "thee",
  "thou",
  "thy",
  "thine",
  "hath",
  "doth",
  "dost",
  "art",
  "wilt",
  "shalt",
  "ye",
  "unto",
  "whence",
  "wherefore",
  "verily",
  "nigh",
  "yonder",
  "hither",
  "whither",
  "morn",
  "eventide",
  "gloria",
  "excelsis",
  "deo",
  "sanctus", // untranslated liturgical Latin
  "gonna",
  "wanna",
  "gotta",
  "kinda",
  "sorta",
  "gimme",
  "lemme",
  "outta",
  "til",
  "ain't",
  "y'all",
  "cause",
];

const VOCALESE = /^(o+h*|a+h+|wo+a*h*|whoa+h*|hm+|mm+|na+|la+|da+|doo+|dum+|yea+h?|hey+)$/i;

function candidateStems(w) {
  const out = [w];
  if (w.endsWith("'s")) out.push(w.slice(0, -2));
  if (w.endsWith("s") && w.length > 3) {
    out.push(w.slice(0, -1));
    if (w.endsWith("es")) out.push(w.slice(0, -2));
    if (w.endsWith("ies")) out.push(w.slice(0, -3) + "y");
  }
  for (const suffix of ["ed", "ing"]) {
    if (!w.endsWith(suffix) || w.length <= suffix.length + 2) continue;
    const base = w.slice(0, -suffix.length);
    out.push(base, base + "e");
    if (base.length >= 2 && base.at(-1) === base.at(-2)) out.push(base.slice(0, -1)); // stopp -> stop
  }
  if (w.endsWith("ly") && w.length > 4) out.push(w.slice(0, -2));
  if (w.endsWith("est") && w.length > 5) out.push(w.slice(0, -3));
  else if (w.endsWith("er") && w.length > 4) out.push(w.slice(0, -2));
  return out;
}

function splitIntoBlocks(lyrics) {
  const lines = lyrics.split("\n");
  const blocks = [];
  let current = { label: null, lines: [] };
  for (const line of lines) {
    const m = /^\[([^\]]+)\]$/.exec(line.trim());
    if (m) {
      if (current.lines.some((l) => l.trim() !== "") || current.label) blocks.push(current);
      current = { label: m[1], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((l) => l.trim() !== "") || current.label) blocks.push(current);
  return blocks;
}

async function main() {
  let dict;
  try {
    dict = await readFile(DICT_PATH, "utf-8");
  } catch {
    console.error(`No word list at ${DICT_PATH} — this script needs a Unix dictionary to run.`);
    process.exit(1);
  }
  const english = new Set(
    dict
      .split("\n")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const w of SUPPLEMENT) english.add(w);

  const isEnglishToken = (w) => {
    if (VOCALESE.test(w)) return null; // excluded, not a miss
    return candidateStems(w).some((s) => s.length >= 2 && english.has(s));
  };

  const coverage = (text) => {
    const tokens = (text.match(/[A-Za-z']+/g) ?? [])
      .map((w) => w.toLowerCase().replace(/^'+|'+$/g, ""))
      .filter((w) => w.length >= 3);
    const judged = tokens.map(isEnglishToken).filter((v) => v !== null);
    if (judged.length === 0) return { ratio: 1, words: 0 };
    return { ratio: judged.filter(Boolean).length / judged.length, words: judged.length };
  };

  const path = process.argv[2] ?? "public/songs-en.json";
  const songs = JSON.parse(await readFile(path, "utf-8"));

  const high = [];
  const borderline = [];
  for (const s of songs) {
    for (const b of splitIntoBlocks(s.lyrics ?? "")) {
      const { ratio, words } = coverage(stripChords(b.lines.join("\n")));
      if (words < MIN_WORDS) continue;
      const text = b.lines.join(" / ").slice(0, 90);
      const row = { title: s.title, label: b.label ?? "(no label)", ratio, words, text };
      if (ratio < HIGH_CONFIDENCE) high.push(row);
      else if (ratio < BORDERLINE) borderline.push(row);
    }
  }

  const print = (rows) =>
    rows.forEach((r) =>
      console.log(
        `${r.title} | ${r.label} | ratio ${r.ratio.toFixed(2)} (${r.words}w) | ${r.text}`,
      ),
    );

  console.log(
    `=== HIGH CONFIDENCE non-English (ratio < ${HIGH_CONFIDENCE}): ${high.length} blocks ===`,
  );
  print(high);
  console.log(
    `\n=== BORDERLINE (${HIGH_CONFIDENCE}–${BORDERLINE}): ${borderline.length} blocks ===`,
  );
  print(borderline);
  console.log(
    "\nThis is a report, not an edit — review each hit before touching the database. " +
      "Expect some of both buckets to be legitimate English: vocalese, archaic spelling, " +
      "and adopted refrain words all read as low-coverage to this heuristic.",
  );
}

main();
