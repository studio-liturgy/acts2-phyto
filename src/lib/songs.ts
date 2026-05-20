// Song search + lyrics via lrclib.net — reliable for worship/CCM lyrics.
// Returns plainLyrics inline with search results (no second request needed).

export interface SongResult {
  title: string;
  artist: string;
  album?: string;
  lyrics: string;
}

interface LrcLibTrack {
  id: number;
  trackName?: string;
  name?: string;
  artistName?: string;
  albumName?: string;
  plainLyrics?: string | null;
  instrumental?: boolean;
}

/**
 * Auto-label song sections by detecting repeated stanzas.
 * - Blocks (blank-line separated) that appear 2+ times → [Chorus]
 * - Other blocks → [Verse N] (incrementing)
 * Skips if the lyrics already contain section markers.
 */
function autoLabelSections(text: string): string {
  if (
    /\[(chorus|verse|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)/i.test(
      text
    )
  ) {
    return text;
  }
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length < 2) return text;

  // Normalise for repetition detection (case + punctuation-insensitive).
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\n]+/gu, " ").trim();
  const counts = new Map<string, number>();
  for (const b of blocks) {
    const k = norm(b);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  let verseN = 0;
  let bridgeUsed = false;
  const out: string[] = [];
  const seenChorusFirst = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const k = norm(b);
    const reps = counts.get(k) ?? 1;
    let label: string;
    if (reps >= 2) {
      label = "[Chorus]";
      seenChorusFirst.add(k);
    } else if (i === blocks.length - 1 && blocks.length >= 4 && !bridgeUsed) {
      // Heuristic: a unique block near the end is often the bridge.
      label = "[Bridge]";
      bridgeUsed = true;
    } else {
      verseN += 1;
      label = `[Verse ${verseN}]`;
    }
    out.push(`${label}\n${b}`);
  }
  return out.join("\n\n");
}

export async function searchSongs(query: string): Promise<SongResult[]> {
  if (!query.trim()) return [];
  const res = await fetch(
    `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error("Search failed");
  const data = (await res.json()) as LrcLibTrack[];
  return (data ?? [])
    .filter((d) => d.plainLyrics && !d.instrumental)
    .slice(0, 20)
    .map((d) => ({
      title: d.trackName ?? d.name ?? "Untitled",
      artist: d.artistName ?? "Unknown",
      album: d.albumName,
      lyrics: autoLabelSections((d.plainLyrics ?? "").replace(/\r\n/g, "\n").trim()),
    }));
}
