import { db } from './db';
import type { Set as PhytoSet } from './types';
import { useLibrary } from './store';

// ---------------------------------------------------------------------------
// File format
// ---------------------------------------------------------------------------

interface PhytoFileV1 {
  version: 1;
  exported_at: string;
  sets: PhytoSet[];
}

type PhytoFile = PhytoFileV1;

// ---------------------------------------------------------------------------
// Migration shim — extend here when v2+ is introduced
// ---------------------------------------------------------------------------

export function migratePhytoFile(data: Record<string, unknown>): PhytoFileV1 {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid .phyto file: not a JSON object.');
  }
  if (!('version' in data)) {
    throw new Error('Invalid .phyto file: missing "version" field.');
  }
  if (data.version === 1) {
    return data as unknown as PhytoFileV1;
  }
  throw new Error(
    `Unrecognised .phyto file version: ${data.version}. Please update phyto to open this file.`
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportCatalogue(): Promise<void> {
  const sets = await db.sets.toArray();

  const payload: PhytoFile = {
    version: 1,
    exported_at: new Date().toISOString(),
    sets,
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

  if (mode === 'replace') {
    await db.sets.clear();
    await db.sets.bulkAdd(sets);
  } else {
    // merge: upsert by id — overwrites same-id sets, adds new ones
    await db.sets.bulkPut(sets);
  }

  // Refresh the Zustand store from Dexie
  await useLibrary.getState().loadFromDb();

  return sets.length;
}
