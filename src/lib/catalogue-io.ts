import { db } from './db';
import type { Set as PhytoSet, Gathering } from './types';
import { useLibrary } from './store';
import { nanoid } from 'nanoid';

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
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid .phyto file: not a JSON object.');
  }
  if (!('version' in data)) {
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
    `Unrecognised .phyto file version: ${data.version}. Please update phyto to open this file.`
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportCatalogue(): Promise<void> {
  const [sets, gatherings] = await Promise.all([
    db.sets.toArray(),
    db.gatherings.toArray(),
  ]);

  const payload: PhytoFile = {
    version: 2,
    exported_at: new Date().toISOString(),
    sets,
    gatherings,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const a = document.createElement('a');
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

export async function importCatalogue(
  file: File,
  mode: 'merge' | 'replace'
): Promise<number> {
  const text = await file.text();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Could not parse .phyto file: invalid JSON.');
  }

  const data = migratePhytoFile(raw);
  const sets: PhytoSet[] = data.sets ?? [];
  // Defensively backfill fields that v1 / hand-edited files may lack.
  const gatherings: Gathering[] = (data.gatherings ?? []).map((g) => ({
    ...g,
    setIds: g.setIds ?? [],
    share_token: g.share_token || nanoid(10),
    is_live: g.is_live ?? false,
  }));

  if (mode === 'replace') {
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
