import { db } from "@/lib/db";

// `db` is a module-level Dexie singleton shared by sync.ts and migrate-legacy.ts,
// so isolation between tests means clearing tables, not swapping IDB factories.
export async function resetDb() {
  await Promise.all([db.sets.clear(), db.gatherings.clear(), db.gathering_sets.clear()]);
}
