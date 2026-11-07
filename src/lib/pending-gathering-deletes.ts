/** Gatherings the user has just deleted whose server delete is still running.
 *  The store hides them at once (the click), and every re-derive from Dexie
 *  (liveQuery, workspace load) skips them until the delete has finished, so a
 *  background sync holding the lock can't show them again in between. */
const deleting = new Set<string>();

export function markGatheringDeleting(id: string): void {
  deleting.add(id);
}

export function clearGatheringDeleting(id: string): void {
  deleting.delete(id);
}

export function isGatheringDeleting(id: string): boolean {
  return deleting.has(id);
}
