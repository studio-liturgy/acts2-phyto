import type { Set as PhytoSet } from "./types";

// A set created inside a group is pushed first and granted second (the
// group_sets FK needs the set row). Until the grant lands, the server's grant
// list doesn't include it, so a sync in that window must not read "no grant" as
// "removed from the group". Tracked per tab: the grant is written by this tab.
const pending = new Map<string, Set<string>>();

export function markGroupGrantPending(setId: string, groupId: string): void {
  const groups = pending.get(setId) ?? new Set<string>();
  groups.add(groupId);
  pending.set(setId, groups);
}

export function clearGroupGrantPending(setId: string, groupId: string): void {
  const groups = pending.get(setId);
  if (!groups) return;
  groups.delete(groupId);
  if (!groups.size) pending.delete(setId);
}

export function pendingGroupGrants(setId: string): string[] {
  return [...(pending.get(setId) ?? [])];
}

/** Group-tag changes for my own sets: the server's grants plus any grant this
 *  tab is still creating. */
export function ownGroupTagUpdates(
  local: PhytoSet[],
  groupsBySet: Map<string, string[]>,
  pendingFor: (setId: string) => string[] = pendingGroupGrants,
): { id: string; groupIds: string[] }[] {
  const updates: { id: string; groupIds: string[] }[] = [];
  for (const s of local) {
    if (s.shared) continue;
    const desired = [...new Set([...(groupsBySet.get(s.id) ?? []), ...pendingFor(s.id)])];
    const current = s.groupIds ?? [];
    const same = desired.length === current.length && desired.every((g) => current.includes(g));
    if (!same) updates.push({ id: s.id, groupIds: desired });
  }
  return updates;
}
