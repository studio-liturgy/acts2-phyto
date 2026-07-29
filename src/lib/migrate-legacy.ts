import { db } from "./db";
import type { Set as PhytoSet, Gathering } from "./types";
import { nanoid } from "nanoid";

// Keys are frozen contracts on already-shipped (phase-0) data — do NOT rename.
const LEGACY_KEY = "stage-library-v1";
const MIGRATED_FLAG = "phyto-legacy-migrated-v1";
const SONG_TEMPLATE_KEY = "song-template-v1";

// Phase-0 shape: catalogue persisted by zustand `persist`. Gatherings were
// called "playlists" and lacked share_token / is_live. These field names are
// frozen in shipped data and must stay `sets` / `playlists` here, regardless of
// the in-app Playlist -> Gathering rename.
interface LegacyGathering {
  id: string;
  name: string;
  setIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface LegacyState {
  sets?: Record<string, PhytoSet>;
  playlists?: Record<string, LegacyGathering>;
  songTemplate?: unknown;
}

/**
 * One-time migration of a phase-0 catalogue (zustand-persisted under
 * localStorage["stage-library-v1"]) into the Dexie data layer. Safe to call on
 * every mount — it no-ops after the first run. Returns the number of sets
 * migrated (0 if there was nothing to migrate).
 */
export async function migrateLegacyLocalStorage(): Promise<number> {
  if (typeof window === "undefined") return 0;

  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return 0;

    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATED_FLAG, "1");
      return 0;
    }

    // zustand persist wraps the payload as { state, version }; fall back to the
    // root object if it was stored unwrapped.
    const parsed = JSON.parse(raw) as { state?: LegacyState } | LegacyState;
    const state: LegacyState =
      parsed && typeof parsed === "object" && "state" in parsed && parsed.state
        ? (parsed.state as LegacyState)
        : (parsed as LegacyState);

    const legacySets = Object.values(state.sets ?? {});
    const legacyGatherings = Object.values(state.playlists ?? {});

    // Re-id every set with a fresh UUID so migrated rows are Supabase-ready
    // (phase-0 ids are short base36, but Supabase id columns are uuid). Slide
    // ids live inside the set and stay as-is.
    const idMap = new Map<string, string>();
    const migratedSets: PhytoSet[] = legacySets.map((s) => {
      const newId = crypto.randomUUID();
      idMap.set(s.id, newId);
      return { ...s, id: newId };
    });

    const now = Date.now();
    const migratedGatherings: Gathering[] = legacyGatherings.map((g) => ({
      id: crypto.randomUUID(),
      name: g.name,
      // Remap set references through the id map; drop any that no longer resolve.
      setIds: (g.setIds ?? []).map((sid) => idMap.get(sid)).filter((x): x is string => Boolean(x)),
      // Backfill fields the phase-0 shape lacked.
      share_token: nanoid(10),
      is_live: false,
      live_started_at: null,
      createdAt: g.createdAt ?? now,
      updatedAt: g.updatedAt ?? now,
    }));

    if (migratedSets.length) await db.sets.bulkPut(migratedSets);
    if (migratedGatherings.length) await db.gatherings.bulkPut(migratedGatherings);

    // Carry over the global song template if the new key isn't already set.
    if (state.songTemplate && !localStorage.getItem(SONG_TEMPLATE_KEY)) {
      try {
        localStorage.setItem(SONG_TEMPLATE_KEY, JSON.stringify(state.songTemplate));
      } catch {}
    }

    localStorage.setItem(MIGRATED_FLAG, "1");
    // Note: the legacy key is intentionally NOT deleted — kept as a safety net.
    return migratedSets.length;
  } catch (e) {
    // A malformed blob must never block app boot. Flag it so we don't retry
    // every load, and continue with an empty Dexie.
    console.error("[migrate-legacy] migration failed (continuing):", e);
    try {
      localStorage.setItem(MIGRATED_FLAG, "1");
    } catch {}
    return 0;
  }
}
