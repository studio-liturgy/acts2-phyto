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
      lyrics: (d.plainLyrics ?? "").replace(/\r\n/g, "\n").trim(),
    }));
}
