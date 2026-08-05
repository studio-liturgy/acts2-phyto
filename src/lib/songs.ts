// Song search + lyrics. Christian/worship-focused.
//
// Search order:
//   1. Local OpenSong worship database (public/songs-en.json, ~3 100 curated
//      songs, over half of them carrying inline chords and a tagged key).
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
  /** Key the local database tags this song with, when it has one. Only set for
   *  local results, and only useful when the lyrics carry chords. */
  key?: string;
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
  "hillsong",
  "hillsong worship",
  "hillsong united",
  "hillsong young",
  "hillsong kids",
  "hillsong español",
  "bethel",
  "bethel music",
  "elevation",
  "elevation worship",
  "maverick city",
  "maverick city music",
  "passion",
  "passion music",
  "upperroom",
  "upper room",
  "mosaic msc",
  "housefires",
  "vertical worship",
  "gateway worship",
  "river valley worship",
  "cross worship",
  "planetshakers",
  "planetboom",
  "vineyard worship",
  "vineyard music",
  "integrity music",
  "hosanna music",
  "north point",
  "sovereign grace",
  "city alight",
  "cityalight",
  "all sons & daughters",
  "jesus image",
  // Individual worship leaders
  "chris tomlin",
  "matt redman",
  "phil wickham",
  "lauren daigle",
  "kari jobe",
  "pat barrett",
  "brandon lake",
  "cody carnes",
  "kristian stanfill",
  "jesus culture",
  "tasha cobbs",
  "tasha cobbs leonard",
  "we the kingdom",
  "stephen mcwhirter",
  "shane & shane",
  "shane and shane",
  "keith getty",
  "kristyn getty",
  "rend collective",
  "crowder",
  "david crowder",
  "michael w smith",
  "tim hughes",
  "stuart townend",
  "graham kendrick",
  "darlene zschech",
  "reuben morgan",
  "tauren wells",
  "leeland",
  "blessing offor",
  "jonathan david helser",
  "melissa helser",
  "steffany gretzinger",
  "william mcdowell",
  "travis greene",
  "tye tribbett",
  "israel houghton",
  "ron kenoly",
  "don moen",
  "robin mark",
  "andy park",
  "abbie gamboa",
  "aaron tedeschi",
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
    const cleaned = raw
      .replace(/\([^)\n]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned === "") continue; // annotation-only line → drop it entirely
    out.push(cleaned);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
      .replace(
        /^\s*(verse\s*\d*|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)\s*:?\s*$/gim,
        "",
      )
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
// Query parsing — split "Title by Artist" into a title and artist list
// ---------------------------------------------------------------------------

export interface ParsedQuery {
  title: string;
  artists: string[];
  raw: string;
}

// Connectors used between multiple artists ("A, B and C", "A feat. B", "A & B").
const ARTIST_SPLIT = /\s*(?:,|&|\/|\+|\band\b|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bx\b)\s*/i;

// Parse a free-text query. "Our God Reigns by Martin Smith, Kari Jobe and Cody
// Carnes" -> { title: "Our God Reigns", artists: ["martin smith", "kari jobe",
// "cody carnes"] }. With no recognised separator the whole string is the title.
// The greedy split on the LAST " by " keeps real titles intact; genuine false
// splits ("Step By Step") are caught by the whole-string retry in searchSongs.
export function parseQuery(raw: string): ParsedQuery {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  let title = cleaned;
  let artistStr = "";

  const byMatch = cleaned.match(/^(.*\S)\s+by\s+(\S.*)$/i);
  const dashMatch = cleaned.match(/^(.*\S)\s+[-–—]\s+(\S.*)$/);
  if (byMatch) {
    title = byMatch[1].trim();
    artistStr = byMatch[2].trim();
  } else if (dashMatch) {
    title = dashMatch[1].trim();
    artistStr = dashMatch[2].trim();
  }

  const artists = artistStr
    ? artistStr
        .split(ARTIST_SPLIT)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (!title.trim()) title = cleaned;
  return { title: title.trim(), artists, raw: cleaned };
}

// ---------------------------------------------------------------------------
// Local worship database (public/songs-en.json)
// ---------------------------------------------------------------------------

interface LocalSong {
  title: string;
  artist: string;
  aka?: string;
  lyrics: string;
  key?: string;
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
    .replace(
      /^\s*(verse\s*\d*|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)\s*:?\s*$/gim,
      "",
    )
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// A local result tagged with whether it matched on title/metadata (strong) or
// only via a lyric phrase (weak). searchSongs uses this so a flood of weak
// lyric matches can't suppress the online search or crowd out the real song.
type ScoredLocal = SongResult & { _strong: boolean };

function searchLocal(db: LocalSong[], parse: ParsedQuery): ScoredLocal[] {
  const titlePhrase = parse.title.toLowerCase().trim();
  const titleTerms = titlePhrase.split(/\s+/).filter(Boolean);
  if (titleTerms.length === 0) return [];

  // Strict to the named artist: when an artist is given, every kept song must
  // match one of the named artists.
  const artistOk = (artist: string): boolean =>
    parse.artists.length === 0 || parse.artists.some((a) => artist.toLowerCase().includes(a));

  // Strong: every title term is in the title/alternate-title. Weak: (multi-word
  // titles only) the title phrase appears contiguously in the lyrics body.
  // Phrase-matching the lyrics lets a remembered line find its song without
  // flooding results with every hymn that merely contains each common word
  // ("is", "our", "god"…) somewhere.
  type Hit = { song: LocalSong; score: number };
  const hits: Hit[] = [];
  for (const s of db) {
    if (!artistOk(s.artist)) continue;
    const titleMeta = `${s.title} ${s.aka ?? ""}`.toLowerCase();
    if (titleTerms.every((t) => titleMeta.includes(t))) {
      const title = s.title.toLowerCase();
      let score = 1; // all title terms present but not contiguous
      if (title === titlePhrase) score = 4;
      else if (title.startsWith(titlePhrase)) score = 3;
      else if (title.includes(titlePhrase)) score = 2;
      hits.push({ song: s, score });
    } else if (titleTerms.length >= 2) {
      const body = s.lyrics.toLowerCase().replace(/\s+/g, " ");
      if (body.includes(titlePhrase)) hits.push({ song: s, score: 0 });
    }
  }

  // Rank title matches above lyrics-only matches so the canonical title wins.
  hits.sort((a, b) => b.score - a.score);

  // Collapse content-duplicates, keeping the highest-ranked (best title) entry.
  const seen = new Set<string>();
  const out: ScoredLocal[] = [];
  for (const { song, score } of hits) {
    const k = lyricsKey(song.lyrics);
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push({
      title: song.title,
      artist: song.artist,
      lyrics: segmentAndDedupe(song.lyrics),
      key: song.key,
      source: "local",
      _strong: score >= 1,
    });
    if (out.length >= 20) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// lrclib.net fallback (worship artists OR strong title match)
// ---------------------------------------------------------------------------

// Loose normalisation for comparing titles/queries: lowercase, drop everything
// that isn't a letter or number, collapse whitespace. Same alphabet-only idea
// used by lyricsKey, so "The Wonderful Blood" and "the wonderful blood!" match.
function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
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

// One lrclib search, with an 8s timeout so a hung request can't freeze the
// importer. Returns [] on any network/timeout error rather than throwing, so a
// flaky online search never hides the local results.
async function fetchLrc(q: string): Promise<LrcLibTrack[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    return (await res.json()) as LrcLibTrack[];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

type RankedTrack = SongResult & { _worship: boolean; _titleMatch: boolean };

function mapTracks(data: LrcLibTrack[], title: string): RankedTrack[] {
  return (data ?? [])
    .filter((d) => d.plainLyrics && !d.instrumental)
    .map((d) => {
      const t = cleanTitle(d.trackName ?? d.name ?? "Untitled");
      const artist = d.artistName ?? "Unknown";
      return {
        title: t,
        artist,
        album: d.albumName,
        lyrics: segmentAndDedupe((d.plainLyrics ?? "").replace(/\r\n/g, "\n").trim()),
        source: "online" as const,
        _worship: isWorshipArtist(artist),
        _titleMatch: titleMatches(title, t),
      };
    });
}

// Rank worship artists / title matches first, then dedupe the many
// near-identical entries lrclib returns for one song.
function rankAndDedupe(items: RankedTrack[]): SongResult[] {
  items.sort(
    (a, b) =>
      (b._worship ? 2 : 0) +
      (b._titleMatch ? 1 : 0) -
      ((a._worship ? 2 : 0) + (a._titleMatch ? 1 : 0)),
  );
  const seen = new Set<string>();
  const out: SongResult[] = [];
  for (const { _worship: _w, _titleMatch: _tm, ...rest } of items) {
    const k = `${normTitle(rest.title)}|${normTitle(rest.artist)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(rest);
    if (out.length >= 20) break;
  }
  return out;
}

async function searchLrcLib(parse: ParsedQuery): Promise<SongResult[]> {
  const { title, artists } = parse;

  // No artist given: send a clean title-only query and keep worship artists OR
  // strong title matches (so a worship song by an uncurated artist still shows).
  if (artists.length === 0) {
    const tracks = mapTracks(await fetchLrc(title), title);
    return rankAndDedupe(tracks.filter((r) => r._worship || r._titleMatch));
  }

  // Artist given: query "<title> <first artist>" — connectors and the other
  // artists are dropped because lrclib AND-matches every token and returns
  // nothing for "Title by A, B and C". Keep only strong title matches credited
  // to one of the named artists (strict). If that misses, a title-only query
  // catches versions credited to the other named artists, still strict-filtered.
  const artistMatch = (artist: string): boolean =>
    artists.some((a) => normTitle(artist).includes(normTitle(a)));
  const strict = (tracks: RankedTrack[]) =>
    tracks.filter((r) => r._titleMatch && artistMatch(r.artist));

  let kept = strict(mapTracks(await fetchLrc(`${title} ${artists[0]}`), title));
  if (kept.length === 0) {
    kept = strict(mapTracks(await fetchLrc(title), title));
  }
  return rankAndDedupe(kept);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

function stripStrong(s: ScoredLocal): SongResult {
  const { _strong: _x, ...rest } = s;
  return rest;
}

async function runSearch(db: LocalSong[], parse: ParsedQuery): Promise<SongResult[]> {
  const local = searchLocal(db, parse);
  const strongLocal = local.filter((s) => s._strong);
  const lyricLocal = local.filter((s) => !s._strong);

  // Skip the online search only when there are plenty of STRONG (title/metadata)
  // local matches. Lyric-only matches no longer count, so a query like "our god
  // reigns" — whose phrase appears in many hymns' bodies — still reaches lrclib
  // and surfaces the actual song.
  if (strongLocal.length >= 6) return strongLocal.slice(0, 10).map(stripStrong);

  const remote = await searchLrcLib(parse);
  const localKeys = new Set(local.map((s) => `${normTitle(s.title)}|${normTitle(s.artist)}`));
  const extra = remote.filter(
    (s) => !localKeys.has(`${normTitle(s.title)}|${normTitle(s.artist)}`),
  );

  // Strong local first, then online, then weak lyric-only local matches last.
  return [...strongLocal.map(stripStrong), ...extra, ...lyricLocal.map(stripStrong)].slice(0, 10);
}

export interface SongSearch {
  // Strong local title matches, available immediately. These keep their place in
  // the final list, so showing them now never causes a later cull. Render right
  // away.
  local: SongResult[];
  // The full list once the (slower) online search has merged in — strong local
  // first, then online, then weak lyric matches. Await and re-render; the list
  // only grows from `local`.
  online: Promise<SongResult[]>;
}

// Two-phase search so the UI can paint instant local results and slot the
// online ones in as they arrive, instead of blocking on the network.
export async function searchSongs(query: string): Promise<SongSearch> {
  if (!query.trim()) return { local: [], online: Promise.resolve([]) };
  const db = await getLocalDb();
  const parsed = parseQuery(query);

  // Only the strong (title) matches are guaranteed to keep their place once the
  // online results merge in — those rank above lyric matches but below strong
  // ones. Showing weak lyric-phrase matches now would only cull them when the
  // online results arrive, so hold them back: they appear in the final merged
  // list below. This keeps the instant list growing downward, never shrinking.
  const hits = searchLocal(db, parsed);
  const strong = hits.filter((s) => s._strong);
  const local = strong.slice(0, 10).map(stripStrong);

  // Enough strong local matches → skip the online round-trip entirely.
  if (strong.length >= 6) {
    const final = strong.slice(0, 10).map(stripStrong);
    return { local: final, online: Promise.resolve(final) };
  }

  const online = (async () => {
    const merged = await runSearch(db, parsed);
    // Guard against a false "Title by Artist" split (e.g. "Step By Step"): if
    // everything came back empty, retry treating the whole query as a title.
    if (merged.length === 0 && parsed.artists.length > 0) {
      return runSearch(db, { title: parsed.raw, artists: [], raw: parsed.raw });
    }
    return merged;
  })();

  return { local, online };
}

// Warm the local song database so the first search paints instantly instead of
// waiting on the one-time JSON load. Safe to call repeatedly.
export function preloadSongs(): void {
  void getLocalDb().catch(() => {});
}

// ---------------------------------------------------------------------------
// Hover preview — the chorus, or the top of the song if unlabelled
// ---------------------------------------------------------------------------

// Return the chorus block for a quick hover preview. Songs from the local DB
// carry section headers ("[Chorus]", "Chorus:"); lrclib lyrics usually don't,
// so fall back to the first block. The header line itself is stripped.
export function songPreview(lyrics: string): string {
  const text = (lyrics ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "";

  const labelOf = (line: string): string | null => {
    const bracket = line.trim().match(/^\[([^\]]+)\]$/);
    if (bracket) return bracket[1].trim().toLowerCase();
    const colon = line.trim().match(/^([A-Za-z][A-Za-z0-9 ]{0,18}):$/);
    if (colon) return colon[1].trim().toLowerCase();
    if (
      /^(chorus|refrain|verse\s*\d*|bridge|pre[- ]?chorus|intro|outro|tag|interlude)\s*$/i.test(
        line.trim(),
      )
    )
      return line.trim().toLowerCase();
    return null;
  };
  const isChorus = (label: string | null): boolean => {
    if (!label) return false;
    const key = label.replace(/[^a-z]/g, "");
    return key.startsWith("chorus") || key === "refrain";
  };

  for (const b of blocks) {
    const lines = b.split("\n");
    if (isChorus(labelOf(lines[0] ?? ""))) {
      return lines.slice(1).join("\n").trim() || b;
    }
  }

  // No labelled chorus → first block, minus a leading header line if present.
  const first = blocks[0].split("\n");
  if (labelOf(first[0] ?? "")) return first.slice(1).join("\n").trim() || blocks[0];
  return blocks[0];
}
