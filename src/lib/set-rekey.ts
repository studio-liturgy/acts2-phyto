// When a push finds that a set's id belongs to a row this account can't write
// (another account's set, or a group or share it lost), sync keeps the set as
// this account's own copy under a fresh id. This remembers old id -> new id so
// an editor still open on the old URL can follow the set to its new address.
// Stored in localStorage so every tab on this device sees it.

const KEY = "phyto:set-rekeys";
const MAX_ENTRIES = 50;

function read(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function recordSetRekey(oldId: string, newId: string): void {
  try {
    const entries = Object.entries(read()).filter(([k]) => k !== oldId);
    entries.push([oldId, newId]);
    const kept = entries.slice(-MAX_ENTRIES);
    globalThis.localStorage?.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage full or unavailable: the editor just shows "Set not found".
  }
}

/** The id a set now lives under, following chained re-keys. Null when the id
 *  was never re-keyed. */
export function resolveSetRekey(id: string): string | null {
  const map = read();
  let cur = map[id];
  if (!cur) return null;
  for (let hops = 0; map[cur] && hops < MAX_ENTRIES; hops++) cur = map[cur];
  return cur;
}
