// Song search + lyrics via lyrics.ovh (free, no key, CORS-enabled)

export interface SongResult {
  title: string;
  artist: string;
  preview?: string;
  albumCover?: string;
}

interface SuggestResponse {
  data?: {
    title: string;
    preview?: string;
    artist?: { name?: string };
    album?: { cover_small?: string };
  }[];
}

export async function searchSongs(query: string): Promise<SongResult[]> {
  if (!query.trim()) return [];
  const res = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  const data = (await res.json()) as SuggestResponse;
  return (data.data ?? []).slice(0, 12).map((d) => ({
    title: d.title,
    artist: d.artist?.name ?? "Unknown",
    preview: d.preview,
    albumCover: d.album?.cover_small,
  }));
}

export async function fetchLyrics(artist: string, title: string): Promise<string> {
  const res = await fetch(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
  );
  if (!res.ok) throw new Error("Lyrics not found");
  const data = (await res.json()) as { lyrics?: string; error?: string };
  if (!data.lyrics) throw new Error(data.error ?? "Lyrics not found");
  return data.lyrics.replace(/\r\n/g, "\n").trim();
}
