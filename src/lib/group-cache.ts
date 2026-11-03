import type { MyGroup } from "@/lib/sync";

// The signed-in account's group list, saved on this device so the group
// switcher has it the moment the page loads, before the list is fetched again.
const KEY = "phyto:my-groups-v1";

type Cached = { userId: string; groups: MyGroup[] };

/** The groups saved for this account, or null when none are saved for it. */
export function readCachedGroups(storage: Storage, userId: string): MyGroup[] | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (c?.userId !== userId || !Array.isArray(c.groups)) return null;
    return c.groups.filter((g) => g && typeof g.id === "string" && typeof g.name === "string");
  } catch {
    return null;
  }
}

export function writeCachedGroups(storage: Storage, userId: string, groups: MyGroup[]): void {
  try {
    storage.setItem(KEY, JSON.stringify({ userId, groups } satisfies Cached));
  } catch {}
}

export function clearCachedGroups(storage: Storage): void {
  try {
    storage.removeItem(KEY);
  } catch {}
}
