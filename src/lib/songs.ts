// Song search + lyrics. Christian/worship-focused.
//
// Search order:
//   1. Local OpenSong worship database (public/songs-en.json, 3 060 curated songs)
//   2. lrclib.net fallback, restricted to known worship artists only

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

// Known worship/Christian artists used to filter lrclib.net results.
// Focus: corporate/congregational worship — not general CCM.
const WORSHIP_ARTISTS = [
  // Collectives / labels
  "hillsong", "hillsong worship", "hillsong united", "hillsong young",
  "hillsong kids", "hillsong español",
  "bethel", "bethel music",
  "elevation", "elevation worship",
  "maverick city", "maverick city music",
  "passion", "passion music",
  "upperroom", "upper room",
  "mosaic msc", "housefires", "vertical worship",
  "gateway worship", "river valley worship", "cross worship",
  "planetshakers", "planetboom",
  "vineyard worship", "vineyard music",
  "integrity music", "hosanna music",
  "north point", "sovereign grace",
  "city alight", "cityalight",
  "all sons & daughters",
  "jesus image",
  // Individual worship leaders
  "chris tomlin", "matt redman", "phil wickham", "lauren daigle",
  "kari jobe", "pat barrett", "brandon lake", "cody carnes",
  "kristian stanfill", "jesus culture",
  "tasha cobbs", "tasha cobbs leonard",
  "we the kingdom", "stephen mcwhirter",
  "shane & shane", "shane and shane",
  "keith getty", "kristyn getty",
  "rend collective", "crowder", "david crowder", "michael w smith",
  "tim hughes", "stuart townend", "graham kendrick",
  "darlene zschech", "reuben morgan",
  "tauren wells", "leeland", "blessing offor",
  "jonathan david helser", "melissa helser", "steffany gretzinger",
  "william mcdowell", "travis greene", "tye tribbett", "israel houghton",
  "ron kenoly", "don moen", "robin mark", "andy park",
  "abbie gamboa", "aaron tedeschi",
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

// ---------------------------------------------------------------------------
// Local worship database (public/songs-en.json)
// ---------------------------------------------------------------------------

interface LocalSong {
  title: string;
  artist: string;
  aka?: string;
  lyrics: string;
}

let localDb: LocalSong[] | null = null;

async function getLocalDb(): Promise<LocalSong[]> {
  if (localDb) return localDb;
  const res = await fetch("/songs-en.json");
  if (!res.ok) throw new Error("Failed to load local song database");
  localDb = (await res.json()) as LocalSong[];
  return localDb;
}

function searchLocal(db: LocalSong[], query: string): SongResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return db
    .filter((s) => {
      const hay = `${s.title} ${s.artist} ${s.aka ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .slice(0, 20)
    .map((s) => ({
      title: s.title,
      artist: s.artist,
      lyrics: segmentAndDedupe(s.lyrics),
    }));
}

// ---------------------------------------------------------------------------
// lrclib.net fallback (strict worship-only filter)
// ---------------------------------------------------------------------------

async function searchLrcLib(query: string): Promise<SongResult[]> {
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

  return mapped
    .filter((r) => r._worship)
    .slice(0, 20)
    .map(({ _worship: _w, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function searchSongs(query: string): Promise<SongResult[]> {
  if (!query.trim()) return [];

  const db = await getLocalDb();
  const local = searchLocal(db, query);
  if (local.length >= 4) return local;

  const remote = await searchLrcLib(query);
  const localKeys = new Set(local.map((s) => `${s.title}|${s.artist}`));
  const extra = remote.filter((s) => !localKeys.has(`${s.title}|${s.artist}`));
  return [...local, ...extra].slice(0, 20);
}
