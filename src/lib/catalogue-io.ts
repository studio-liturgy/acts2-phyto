import { db } from "./db";
import type { Set as PhytoSet, Gathering } from "./types";
import { useLibrary } from "./store";
import { nanoid } from "nanoid";

// ---------------------------------------------------------------------------
// File format
// ---------------------------------------------------------------------------

interface PhytoFileV1 {
  version: 1;
  exported_at: string;
  sets: PhytoSet[];
}

interface PhytoFileV2 {
  version: 2;
  exported_at: string;
  sets: PhytoSet[];
  gatherings: Gathering[];
}

type PhytoFile = PhytoFileV2;

// ---------------------------------------------------------------------------
// Migration shim — normalises any supported version to the current (v2) shape
// ---------------------------------------------------------------------------

export function migratePhytoFile(data: Record<string, unknown>): PhytoFileV2 {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid .phyto file: not a JSON object.");
  }
  if (!("version" in data)) {
    throw new Error('Invalid .phyto file: missing "version" field.');
  }
  if (data.version === 1) {
    // v1 carried sets only — upgrade to v2 with an empty gatherings list.
    const v1 = data as unknown as PhytoFileV1;
    return {
      version: 2,
      exported_at: v1.exported_at,
      sets: v1.sets ?? [],
      gatherings: [],
    };
  }
  if (data.version === 2) {
    return data as unknown as PhytoFileV2;
  }
  throw new Error(
    `Unrecognised .phyto file version: ${data.version}. Please update phyto to open this file.`,
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Export only my OWN rows. Foreign rows (a set shared with me, another
 *  member's group gathering) are someone else's data reached through a grant:
 *  they aren't mine to hand out in a file, and they come back through the share
 *  anyway. Exporting them would also let an import re-create them tagged as
 *  foreign, which the collaborative sync then prunes as "revoked". */
export function exportableRows<T extends { shared?: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => !r.shared);
}

export async function exportCatalogue(setIds?: string[]): Promise<void> {
  const allSets = exportableRows(await db.sets.toArray());
  // When a selection is given, export just those sets and no gatherings (a
  // gathering could reference sets outside the selection, which wouldn't import
  // cleanly). Otherwise export the whole library, gatherings included.
  const sets = setIds ? allSets.filter((s) => setIds.includes(s.id)) : allSets;
  const gatherings = setIds ? [] : exportableRows(await db.gatherings.toArray());

  const payload: PhytoFile = {
    version: 2,
    exported_at: new Date().toISOString(),
    sets,
    gatherings,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const a = document.createElement("a");
  a.href = url;
  a.download = `phyto-catalogue-${today}.phyto`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** An imported row is always MINE. Collaboration tags describe grants that
 *  live in the database, not in a file: `shared` would route the row through
 *  the foreign sync path (which prunes anything without a grant, so the set
 *  would silently vanish), and `groupIds` is re-derived from the real grants on
 *  the next sync. A `group_id` is kept only for a group I'm actually in: RLS
 *  rejects inserts into any other group, and a re-ID retry can't fix that, so
 *  the push would loop forever. Exported for tests. */
export function asOwnedSet(s: PhytoSet, myGroupIds: ReadonlySet<string>): PhytoSet {
  const { shared: _shared, shared_by: _by, groupIds: _gids, group_id, ...rest } = s;
  return group_id && myGroupIds.has(group_id) ? { ...rest, group_id } : rest;
}

export function asOwnedGathering(g: Gathering, myGroupIds: ReadonlySet<string>): Gathering {
  const { shared: _shared, shared_by: _by, group_id, ...rest } = g;
  return group_id && myGroupIds.has(group_id) ? { ...rest, group_id } : rest;
}

export async function importCatalogue(file: File, mode: "merge" | "replace"): Promise<number> {
  const text = await file.text();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Could not parse .phyto file: invalid JSON.");
  }

  const data = migratePhytoFile(raw);
  const myGroupIds = new Set(useLibrary.getState().groups.map((g) => g.id));
  const sets: PhytoSet[] = (data.sets ?? []).map((s) => asOwnedSet(s, myGroupIds));
  // Defensively backfill fields that v1 / hand-edited files may lack.
  const gatherings: Gathering[] = (data.gatherings ?? []).map((g) => ({
    ...asOwnedGathering(g, myGroupIds),
    setIds: g.setIds ?? [],
    share_token: g.share_token || nanoid(10),
    is_live: g.is_live ?? false,
    live_started_at: g.live_started_at ?? null,
  }));

  if (mode === "replace") {
    await db.sets.clear();
    await db.gatherings.clear();
    await db.sets.bulkAdd(sets);
    if (gatherings.length) await db.gatherings.bulkAdd(gatherings);
  } else {
    // merge: upsert by id — overwrites same-id rows, adds new ones
    await db.sets.bulkPut(sets);
    if (gatherings.length) await db.gatherings.bulkPut(gatherings);
  }

  // Refresh the Zustand store from Dexie
  await useLibrary.getState().loadFromDb();

  return sets.length;
}
