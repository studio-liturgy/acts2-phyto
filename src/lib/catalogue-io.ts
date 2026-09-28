import { db } from "./db";
import type { Set as PhytoSet, SetKind, Slide, Gathering } from "./types";
import { useLibrary } from "./store";
import { nanoid } from "nanoid";

// ---------------------------------------------------------------------------
// File format
// ---------------------------------------------------------------------------
//
// A .phyto file is JSON: { version, min_reader_version, exported_at, sets,
// gatherings }. Files move between builds that aren't the same age (prod and
// test, watch, a tab left open for a week), so both directions must hold:
//
// - `version` counts BREAKING changes only: a field renamed, re-shaped or given
//   a new meaning. A new optional field never bumps it. Rows are spread, never
//   picked, so an older reader carries keys it doesn't know straight through,
//   and a newer reader treats a missing one as its default.
// - `min_reader_version` is the oldest reader that can still open the file, and
//   it is what readers check. Bump `version` without raising it when newer
//   readers only need to tell the files apart (to know which fix-ups to run).
// - Readers from before `min_reader_version` existed accept version 1 and 2
//   only, so keep writing 2 for as long as the format allows.
// - Never rename or remove a field readers rely on. Add the new one alongside.

/** The format this build writes, and the newest it can read. */
export const PHYTO_FILE_VERSION = 2;
/** The oldest reader that can open what this build writes. v1 readers only
 *  knew sets, and rejected anything but version 1. */
const MIN_READER_VERSION = 2;

export interface PhytoFile {
  version: number;
  min_reader_version?: number;
  exported_at: string;
  sets: PhytoSet[];
  gatherings: Gathering[];
}

// ---------------------------------------------------------------------------
// Reading: normalises any readable version to the current shape
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isVersion(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Epoch ms from a number or a date string, or undefined for anything else.
 *  Sync turns these into ISO strings, and an invalid date throws there. */
function toEpoch(v: unknown): number | undefined {
  if (typeof v !== "number" && typeof v !== "string") return undefined;
  const ms = new Date(v).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/** Last row wins when a file repeats an id, as it would in the database. */
function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}

/** Backfill what the app can't run without; keep everything else as it came,
 *  including fields and kinds from a newer build, so they survive a round-trip
 *  through this one. */
function readSet(raw: unknown, now: number): PhytoSet | null {
  if (!isRecord(raw)) return null;
  const createdAt = toEpoch(raw.createdAt) ?? now;
  const slides = Array.isArray(raw.slides) ? raw.slides.filter(isRecord) : [];
  return {
    ...raw,
    id: nonEmptyString(raw.id) ?? crypto.randomUUID(),
    name: typeof raw.name === "string" ? raw.name : "",
    kind: (nonEmptyString(raw.kind) ?? "mixed") as SetKind,
    // Every slide is kept, even one repeating another's id: dropping it would
    // lose content, and a repeat is only a React key clash.
    slides: slides.map(
      (sl) => ({ ...sl, id: nonEmptyString(sl.id) ?? crypto.randomUUID() }) as Slide,
    ),
    createdAt,
    updatedAt: toEpoch(raw.updatedAt) ?? createdAt,
  } as PhytoSet;
}

function readGathering(raw: unknown, now: number): Gathering | null {
  if (!isRecord(raw)) return null;
  const createdAt = toEpoch(raw.createdAt) ?? now;
  const setIds = Array.isArray(raw.setIds) ? raw.setIds : [];
  return {
    ...raw,
    id: nonEmptyString(raw.id) ?? crypto.randomUUID(),
    name: typeof raw.name === "string" ? raw.name : "",
    setIds: setIds.filter((id): id is string => typeof id === "string"),
    share_token: nonEmptyString(raw.share_token) ?? nanoid(10),
    is_live: typeof raw.is_live === "boolean" ? raw.is_live : false,
    live_started_at: toEpoch(raw.live_started_at) ?? null,
    createdAt,
    updatedAt: toEpoch(raw.updatedAt) ?? createdAt,
  } as Gathering;
}

function readRows<T extends { id: string }>(
  field: string,
  value: unknown,
  read: (raw: unknown, now: number) => T | null,
): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid .phyto file: "${field}" is not a list.`);
  const now = Date.now();
  return dedupeById(value.map((raw) => read(raw, now)).filter((r): r is T => r !== null));
}

export function migratePhytoFile(data: unknown): PhytoFile {
  if (!isRecord(data)) {
    throw new Error("Invalid .phyto file: not a JSON object.");
  }
  if (!("version" in data)) {
    throw new Error('Invalid .phyto file: missing "version" field.');
  }
  const { version } = data;
  if (!isVersion(version)) {
    throw new Error(`Unrecognised .phyto file version: ${JSON.stringify(version)}.`);
  }
  // A file without a floor (every file before it existed) needs a reader at
  // least as new as the file itself.
  const floor = isVersion(data.min_reader_version) ? data.min_reader_version : version;
  if (floor > PHYTO_FILE_VERSION) {
    throw new Error(
      "This file was made by a newer version of phyto. Reload the page to update, then import it again.",
    );
  }
  return {
    version: PHYTO_FILE_VERSION,
    min_reader_version: MIN_READER_VERSION,
    exported_at: typeof data.exported_at === "string" ? data.exported_at : "",
    sets: readRows("sets", data.sets, readSet),
    // v1 carried sets only.
    gatherings: version === 1 ? [] : readRows("gatherings", data.gatherings, readGathering),
  };
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

/** The file for these rows, as this build writes it. */
export function buildPhytoFile(sets: PhytoSet[], gatherings: Gathering[]): PhytoFile {
  return {
    version: PHYTO_FILE_VERSION,
    min_reader_version: MIN_READER_VERSION,
    exported_at: new Date().toISOString(),
    sets,
    gatherings,
  };
}

export async function exportCatalogue(setIds?: string[]): Promise<void> {
  const allSets = exportableRows(await db.sets.toArray());
  // When a selection is given, export just those sets and no gatherings (a
  // gathering could reference sets outside the selection, which wouldn't import
  // cleanly). Otherwise export the whole library, gatherings included.
  const sets = setIds ? allSets.filter((s) => setIds.includes(s.id)) : allSets;
  const gatherings = setIds ? [] : exportableRows(await db.gatherings.toArray());

  const json = JSON.stringify(buildPhytoFile(sets, gatherings), null, 2);
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
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Could not parse .phyto file: invalid JSON.");
  }

  const data = migratePhytoFile(raw);
  const myGroupIds = new Set(useLibrary.getState().groups.map((g) => g.id));
  const sets = data.sets.map((s) => asOwnedSet(s, myGroupIds));
  const gatherings = data.gatherings.map((g) => asOwnedGathering(g, myGroupIds));

  // One transaction, so a write that fails part-way leaves the library as it
  // was instead of cleared or half-imported.
  await db.transaction("rw", db.sets, db.gatherings, async () => {
    if (mode === "replace") {
      await db.sets.clear();
      await db.gatherings.clear();
    }
    // Upsert by id: overwrites same-id rows, adds new ones.
    await db.sets.bulkPut(sets);
    if (gatherings.length) await db.gatherings.bulkPut(gatherings);
  });

  // Refresh the Zustand store from Dexie
  await useLibrary.getState().loadFromDb();

  return sets.length;
}
