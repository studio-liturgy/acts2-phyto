/**
 * The group switcher's label. In a group, the name comes from the fetched
 * group list, else from the name cached on this device (so a reload shows it
 * at once, before the list arrives), else a "Group" placeholder. `isName` is
 * true when the label is a group's own name, which keeps its own casing.
 */
export function workspaceLabel(
  activeWorkspace: string,
  groups: readonly { id: string; name: string }[],
  cachedName: string,
): { label: string; isName: boolean } {
  if (activeWorkspace === "personal") return { label: "Personal", isName: false };
  const name = groups.find((g) => g.id === activeWorkspace)?.name || cachedName;
  return name ? { label: name, isName: true } : { label: "Group", isName: false };
}
