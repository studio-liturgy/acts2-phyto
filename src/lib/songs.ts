// Song search + lyrics. Christian/worship-focused: results are biased toward
// worship artists and lyric blocks are segmented + deduplicated so each
// unique section appears once (no repeated choruses on import).
//
// Note: no free Christian-only lyrics API exists (CCLI SongSelect, PraiseCharts
// and Worship Together require auth). We use lrclib.net (the most reliable
// open lyrics index) and filter/boost worship results, then segment sections.

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

// Known worship/Christian artists used to bias search results.
const WORSHIP_ARTISTS = [
  "hillsong", "bethel", "elevation", "maverick city", "passion",
  "chris tomlin", "matt redman", "phil wickham", "lauren daigle",
  "kari jobe", "pat barrett", "brandon lake", "cody carnes",
  "kristian stanfill", "housefires", "vertical worship", "jesus culture",
  "for king & country", "for king and country", "tasha cobbs",
  "we the kingdom", "stephen mcwhirter", "shane & shane", "shane and shane",
  "keith getty", "kristyn getty", "sovereign grace", "city alight",
  "cityalight", "hillsong worship", "hillsong united", "hillsong young",
  "north point", "gateway worship", "all sons & daughters",
  "rend collective", "crowder", "david crowder", "michael w smith",
  "casting crowns", "mercyme", "newsboys", "third day", "jeremy camp",
  "lincoln brewster", "paul baloche", "tim hughes", "stuart townend",
  "graham kendrick", "darlene zschech", "reuben morgan",
];

function isWorshipArtist(name?: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return WORSHIP_ARTISTS.some((a) => n.includes(a));
}

/**
 * Auto-label song sections by detecting repeated stanzas, then dedupe
 * repeats so each unique section only appears once on the slides.
 */
function segmentAndDedupe(text: string): string {
  const hasMarkers =
    /\[(chorus|verse|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)/i.test(
      text
    );

  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length < 1) return text;

  // Normalise for repetition detection (case + punctuation-insensitive).
  const norm = (s: string) =>
    s
      .toLowerCase()
      // Strip any inline section markers from comparison.
      .replace(/^\s*\[[^\]]+\]\s*$/gm, "")
      .replace(/[^\p{L}\p{N}\n]+/gu, " ")
      .trim();

  // Count occurrences to find repeated sections (likely choruses).
  const counts = new Map<string, number>();
  for (const b of blocks) {
    const k = norm(b);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  let verseN = 0;
  let bridgeUsed = false;
  const seen = new Set<string>();
  const out: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const k = norm(b);
    if (!k) continue;
    // Skip exact repeats — each unique section gets one slide group.
    if (seen.has(k)) continue;
    seen.add(k);

    let label: string;
    if (hasMarkers && /^\s*\[[^\]]+\]/.test(b)) {
      // Already labeled by source — preserve as-is.
      out.push(b);
      continue;
    }

    const reps = counts.get(k) ?? 1;
    if (reps >= 2) {
      label = "[Chorus]";
    } else if (i === blocks.length - 1 && blocks.length >= 4 && !bridgeUsed) {
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

  const mapped = (data ?? [])
    .filter((d) => d.plainLyrics && !d.instrumental)
    .map((d) => ({
      title: d.trackName ?? d.name ?? "Untitled",
      artist: d.artistName ?? "Unknown",
      album: d.albumName,
      lyrics: segmentAndDedupe((d.plainLyrics ?? "").replace(/\r\n/g, "\n").trim()),
      _worship: isWorshipArtist(d.artistName),
    }));

  // Sort worship matches first; cap to 20.
  mapped.sort((a, b) => Number(b._worship) - Number(a._worship));
  return mapped.slice(0, 20).map(({ _worship: _w, ...rest }) => rest);
}
