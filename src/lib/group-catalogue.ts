/** Group catalogue helpers: the ownership chip and the set editor's remove action. */

/** Ownership chip in a group: off, then my own sets, then everyone else's. */
export type OwnershipFilter = "personal" | "others";

/** Next state of the ownership chip: off, Personal, Others, off. A kind chip
 *  being active counts as off, so a tap always starts at Personal. */
export function nextOwnershipFilter(current: string): OwnershipFilter | "all" {
  if (current === "personal") return "others";
  if (current === "others") return "all";
  return "personal";
}

/** What the set editor's red button does for this set:
 *   "remove-group-admin": someone else's set in the group I own: retract it.
 *   "remove-group": my own set, viewed in a group: retract it.
 *   "remove-shared": a set shared with me: drop my access.
 *   "delete": my own set in my personal library.
 *   null: no button (someone else's set in a group I don't own). */
export type SetRemoveMode = "remove-group-admin" | "remove-group" | "remove-shared" | "delete";

export function setRemoveMode(opts: {
  shared: boolean;
  groupIds: string[];
  activeWorkspace: string;
  isActiveGroupAdmin: boolean;
}): SetRemoveMode | null {
  const { shared, groupIds, activeWorkspace, isActiveGroupAdmin } = opts;
  const inActiveGroup = activeWorkspace !== "personal" && groupIds.includes(activeWorkspace);
  if (shared) {
    if (inActiveGroup && isActiveGroupAdmin) return "remove-group-admin";
    // A set shared into a group belongs to its owner: other members can edit
    // it but can't remove it.
    if (groupIds.length > 0) return null;
    return "remove-shared";
  }
  return inActiveGroup ? "remove-group" : "delete";
}
