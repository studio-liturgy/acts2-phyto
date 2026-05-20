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
 * Dedupe repeated stanzas (e.g. choruses repeated 3× in the source) so each
 * unique block appears once. Preserves any section markers present in the
 * source ("[Chorus]", "Verse 1:" …) but does NOT invent labels — auto
 * labelling proved unreliable and is now done manually in the editor.
 */
function segmentAndDedupe(text: string): string {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length < 1) return text;

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^\s*\[[^\]]+\]\s*$/gm, "")
      .replace(/^\s*(verse\s*\d*|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)\s*:?\s*$/gim, "")
      .replace(/[^\p{L}\p{N}\n]+/gu, " ")
      .trim();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    const k = norm(b);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
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
