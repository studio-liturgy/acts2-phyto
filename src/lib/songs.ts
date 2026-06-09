// Song search + lyrics. Christian/worship-focused.
//
// Search order:
//   1. Local OpenSong worship database (public/songs-en.json, 3 060 curated songs).
//      Matches title, artist, alternate titles, and the lyrics body; content
//      duplicates (same song under different titles) are collapsed to one.
//   2. lrclib.net fallback. Kept results are either by a known worship artist OR
//      have a title that closely matches the query (so a worship song by an
//      artist not on the curated list still surfaces); worship artists rank
//      first. Results are deduped by title/artist.

export interface SongResult {
  title: string;
  artist: string;
  album?: string;
  lyrics: string;
  source: "local" | "online";
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
 * Strip parenthetical annotations like "(Intro)", "(x2)", "(repeat)" that
 * clutter imported lyrics. A line that is only an annotation is dropped;
 * genuine blank lines (stanza breaks) and square-bracket section headers
 * ("[Verse 1]") are preserved.
 */
function stripAnnotations(text: string): string {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if (raw.trim() === "") {
      out.push(""); // keep stanza break
      continue;
    }
    const cleaned = raw.replace(/\([^)\n]*\)/g, "").replace(/\s+/g, " ").trim();
    if (cleaned === "") continue; // annotation-only line → drop it entirely
    out.push(cleaned);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Dedupe repeated stanzas (e.g. choruses repeated 3× in the source) so each
 * unique block appears once. Preserves any section markers present in the
 * source ("[Chorus]", "Verse 1:" …) but does NOT invent labels — auto
 * labelling proved unreliable and is now done manually in the editor.
 */
function segmentAndDedupe(text: string): string {
  const blocks = stripAnnotations(text)
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

// Normalised fingerprint of a song's lyrics, used to collapse the many
// same-content-different-title duplicates in the OpenSong source (e.g. a hymn
// catalogued under each of its first lines as separate entries).
function lyricsKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\s*\[[^\]]+\]\s*$/gm, "")
    .replace(/^\s*(verse\s*\d*|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)\s*:?\s*$/gim, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function searchLocal(db: LocalSong[], query: string): SongResult[] {
  const q = query.toLowerCase().trim();
  const terms = q.split(/\s+/).filter(Boolean);

  // Match if every term is in the title/artist/alternate-title, OR (for
  // multi-word queries) the whole query appears as a contiguous phrase in the
  // lyrics body. Phrase-matching the lyrics lets a remembered line find its
  // song without flooding results with every hymn that merely contains each
  // common word ("is", "our", "god"…) somewhere.
  const matched = db.filter((s) => {
    const meta = `${s.title} ${s.artist} ${s.aka ?? ""}`.toLowerCase();
    if (terms.every((t) => meta.includes(t))) return true;
    if (terms.length >= 2) {
      return s.lyrics.toLowerCase().replace(/\s+/g, " ").includes(q);
    }
    return false;
  });

  // Rank title matches above lyrics-only matches so the canonical title wins.
  const score = (s: LocalSong): number => {
    const title = s.title.toLowerCase();
    if (title === q) return 4;
    if (title.startsWith(q)) return 3;
    if (title.includes(q)) return 2;
    const meta = `${s.title} ${s.artist} ${s.aka ?? ""}`.toLowerCase();
    if (terms.every((t) => meta.includes(t))) return 1; // all terms in title/artist/aka
    return 0; // matched only via the lyrics body
  };
  matched.sort((a, b) => score(b) - score(a));

  // Collapse content-duplicates, keeping the highest-ranked (best title) entry.
  const seen = new Set<string>();
  const unique: LocalSong[] = [];
  for (const s of matched) {
    const k = lyricsKey(s.lyrics);
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    unique.push(s);
  }

  return unique.slice(0, 20).map((s) => ({
    title: s.title,
    artist: s.artist,
    lyrics: segmentAndDedupe(s.lyrics),
    source: "local" as const,
  }));
}

// ---------------------------------------------------------------------------
// lrclib.net fallback (worship artists OR strong title match)
// ---------------------------------------------------------------------------

// Loose normalisation for comparing titles/queries: lowercase, drop everything
// that isn't a letter or number, collapse whitespace. Same alphabet-only idea
// used by lyricsKey, so "The Wonderful Blood" and "the wonderful blood!" match.
function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// True when an lrclib title is a strong match for the query: one contains the
// other, or every query token appears in the title. Lets a worship song by an
// artist not on the curated list surface while keeping unrelated tracks out.
function titleMatches(query: string, title: string): boolean {
  const q = normTitle(query);
  const t = normTitle(title);
  if (!q || !t) return false;
  if (t.includes(q) || q.includes(t)) return true;
  return q.split(" ").every((term) => t.includes(term));
}

// lrclib sometimes appends "| Artist" to the track name; drop it for display
// and matching.
function cleanTitle(title: string): string {
  return title.replace(/\s*\|\s*.*$/, "").trim() || title.trim();
}

async function searchLrcLib(query: string): Promise<SongResult[]> {
  const res = await fetch(
    `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error("Search failed");
  const data = (await res.json()) as LrcLibTrack[];

  const mapped = (data ?? [])
    .filter((d) => d.plainLyrics && !d.instrumental)
    .map((d) => {
      const title = cleanTitle(d.trackName ?? d.name ?? "Untitled");
      const artist = d.artistName ?? "Unknown";
      return {
        title,
        artist,
        album: d.albumName,
        lyrics: segmentAndDedupe((d.plainLyrics ?? "").replace(/\r\n/g, "\n").trim()),
        source: "online" as const,
        _worship: isWorshipArtist(artist),
        _titleMatch: titleMatches(query, title),
      };
    })
    // Keep worship artists OR strong title matches; rank worship artists first.
    .filter((r) => r._worship || r._titleMatch);

  mapped.sort(
    (a, b) =>
      (b._worship ? 2 : 0) + (b._titleMatch ? 1 : 0) -
      ((a._worship ? 2 : 0) + (a._titleMatch ? 1 : 0))
  );

  // Dedupe the many near-identical entries lrclib returns for one song.
  const seen = new Set<string>();
  const out: SongResult[] = [];
  for (const { _worship: _w, _titleMatch: _tm, ...rest } of mapped) {
    const k = `${normTitle(rest.title)}|${normTitle(rest.artist)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(rest);
    if (out.length >= 20) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function searchSongs(query: string): Promise<SongResult[]> {
  if (!query.trim()) return [];

  const db = await getLocalDb();
  const local = searchLocal(db, query);
  if (local.length >= 6) return local.slice(0, 10);

  const remote = await searchLrcLib(query);
  const localKeys = new Set(local.map((s) => `${s.title}|${s.artist}`));
  const extra = remote.filter((s) => !localKeys.has(`${s.title}|${s.artist}`));
  return [...local, ...extra].slice(0, 10);
}
