/**
 * Runs the song-library clean-up (src/lib/song-db-clean.ts) over the committed
 * public/songs-en.json, with the hand fixes in scripts/song-fixes.json.
 *
 * Usage:
 *   node scripts/clean-songs.ts            write the cleaned file
 *   node scripts/clean-songs.ts --report   write nothing; print every changed song
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanSongLyrics, type LineFixes } from "../src/lib/song-db-clean.ts";

type Song = { title: string; artist: string; lyrics: string; aka?: string; key?: string };

const root = process.cwd();
const path = join(root, "public", "songs-en.json");
const songs = JSON.parse(readFileSync(path, "utf8")) as Song[];
const fixes = JSON.parse(
  readFileSync(join(root, "scripts", "song-fixes.json"), "utf8"),
) as LineFixes;
const report = process.argv.includes("--report");

/** Changed lines only, in order (LCS diff). */
function lineDiff(a: string[], b: string[]): string[] {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      i++;
      j++;
    } else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) out.push(`+ ${b[j++]}`);
    else out.push(`- ${a[i++]}`);
  }
  return out.filter((l) => l !== "+ " && l !== "- ");
}

let changed = 0;
const lines: string[] = [];
for (const s of songs) {
  const next = cleanSongLyrics(s.lyrics, s.title, fixes);
  if (next === s.lyrics) continue;
  changed++;
  if (report) {
    lines.push(`===== ${s.title}${s.artist ? ` / ${s.artist}` : ""}`);
    lines.push(...lineDiff(s.lyrics.split("\n"), next.split("\n")));
  }
  s.lyrics = next;
}

if (report) {
  console.log(lines.join("\n"));
  console.error(`${changed} of ${songs.length} songs would change`);
} else {
  writeFileSync(path, JSON.stringify(songs, null, 2));
  console.log(`${changed} of ${songs.length} songs cleaned`);
}
