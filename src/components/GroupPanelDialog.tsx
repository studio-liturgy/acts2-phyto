import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/authStore";
import { useLibrary } from "@/lib/store";
import { WorkspaceSettingsRows } from "@/components/WorkspaceSettingsRows";
import { ToggleAddButton } from "@/components/ToggleAddButton";
import {
  fetchGroupMembers,
  fetchMemberGroupSetIds,
  inviteGroupMember,
  removeGroupMember,
  renameGroup,
  type GroupMember,
  type MyGroup,
} from "@/lib/sync";

/**
 * Manage a group's roster: the owner invites and removes members and can rename
 * or delete the group; any member can leave. Leaving or being removed keeps your
 * own sets in your personal library and pulls the sets you shared back out of the
 * group (and its gatherings) with you — no strings attached either way.
 */
export function GroupPanelDialog({
  open,
  onOpenChange,
  group,
  onChanged,
  mode = "manage",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: MyGroup;
  onChanged?: () => void;
  /**
   * "manage" is the full roster panel. "invite" is the pared-down step shown
   * right after a group is created: same invite + member list, but no renaming
   * and no delete/leave — you can't tear down a group you just made here.
   */
  mode?: "manage" | "invite";
}) {
  const session = useAuthStore((s) => s.session);
  const loadGroups = useLibrary((s) => s.loadGroups);
  const leaveGroupById = useLibrary((s) => s.leaveGroupById);
  const deleteGroupById = useLibrary((s) => s.deleteGroupById);
  const librarySets = useLibrary((s) => s.sets);
  const isOwner = !!session && group.owner_id === session.user.id;
  const isInvite = mode === "invite";

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [name, setName] = useState(group.name);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Rename feedback lives under the name box, not with the shared status line.
  const [nameDone, setNameDone] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  // Member the owner is about to remove, plus the sets that would leave the group
  // with them (null = still loading; count is authoritative, names are whatever
  // the local library can resolve).
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);
  const [removeSets, setRemoveSets] = useState<{ count: number; names: string[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(group.name);
    setEmail("");
    setError(null);
    setDone(null);
    setConfirm(null);
    setRemoveTarget(null);
    setRemoveSets(null);
    setNameDone(false);
    fetchGroupMembers(group.id).then(setMembers);
  }, [open, group.id, group.name]);

  const refresh = () => fetchGroupMembers(group.id).then(setMembers);

  const invite = async () => {
    const e = email.trim().toLowerCase();
    if (!e || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await inviteGroupMember(group.id, e);
    setBusy(false);
    if (result === "self") return setError("You're already in this group.");
    if (result === "exists") return setError("That person is already invited.");
    if (result === "error") return setError("Could not invite. Try again.");
    setEmail("");
    await refresh();
  };

  // Step 1: ask to confirm, loading the list of sets that will leave with them.
  // Only one confirmation is open at a time, so clear a pending delete/leave.
  const startRemove = async (m: GroupMember) => {
    setConfirm(null);
    setRemoveTarget(m);
    setRemoveSets(null);
    setError(null);
    setDone(null);
    const ids = m.userId ? await fetchMemberGroupSetIds(group.id, m.userId) : [];
    const names = ids
      .map((id) => librarySets[id]?.name)
      .filter((n): n is string => !!n && n.trim().length > 0);
    setRemoveSets({ count: ids.length, names });
  };

  // Open the delete/leave confirmation, closing any pending member removal.
  const startDestroy = () => {
    setRemoveTarget(null);
    setRemoveSets(null);
    setError(null);
    setDone(null);
    setConfirm(isOwner ? "delete" : "leave");
  };

  // Step 2: actually remove. Their sets leave the group with them.
  const confirmRemove = async () => {
    const m = removeTarget;
    if (!m) return;
    await removeGroupMember(group.id, m.email, m.userId);
    setRemoveTarget(null);
    setRemoveSets(null);
    setDone(`Removed ${m.email}.`);
    await refresh();
    onChanged?.();
  };

  const saveName = async () => {
    const n = name.trim();
    if (!n || n === group.name) return;
    await renameGroup(group.id, n);
    await loadGroups();
    setNameDone(true);
    onChanged?.();
  };

  const leave = async () => {
    const ok = await leaveGroupById(group.id);
    if (ok) {
      onChanged?.();
      onOpenChange(false);
    } else {
      setError("Could not leave. Try again.");
    }
  };

  const destroy = async () => {
    const ok = await deleteGroupById(group.id);
    if (ok) {
      onChanged?.();
      onOpenChange(false);
    } else {
      setError("Could not delete. Try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 rounded-3xl p-8"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="text-2xl font-normal leading-tight">
          {isInvite ? "Invite people" : isOwner ? "Manage group" : group.name}
        </DialogTitle>

        {isOwner && !isInvite && (
          <div className="mt-6">
            <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Name
            </div>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameDone(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                }}
                className="mono flex-1 rounded-full border border-foreground bg-background px-4 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={saveName}
                disabled={!name.trim() || name.trim() === group.name}
                className="mono uppercase rounded-full bg-foreground px-4 py-2 text-xs tracking-wider text-background transition hover:opacity-90 disabled:opacity-40"
              >
                Rename
              </button>
            </div>
            {nameDone && (
              <p className="mono mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Group renamed.
              </p>
            )}
          </div>
        )}

        {/* The group's own preferences (multi-language, main language): the
            owner's to set, so members don't see them. Not shown in the
            just-created invite step, which is about people. */}
        {isOwner && !isInvite && (
          <div className="mt-6 border-b border-foreground/15 pb-4">
            <WorkspaceSettingsRows />
          </div>
        )}

        {isOwner && (
          <>
            <div className="mono mb-2 mt-6 text-[10px] uppercase tracking-wider text-muted-foreground">
              Invite
            </div>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") invite();
                }}
                placeholder="name@email.com"
                className="mono uppercase flex-1 rounded-full border border-foreground bg-background px-4 py-2 text-sm outline-none"
              />
              <ToggleAddButton
                on={false}
                disabled={busy || !email.trim()}
                onClick={invite}
                addLabel="Invite this email"
              />
            </div>
          </>
        )}

        <div className="mono mb-2 mt-6 text-[10px] uppercase tracking-wider text-muted-foreground">
          Members
        </div>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <span className="mono flex-1 truncate text-sm uppercase">{m.email}</span>
              {m.pending && (
                <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Pending
                </span>
              )}
              {m.userId === group.owner_id && (
                <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Admin
                </span>
              )}
              {isOwner && !m.isMe && removeTarget?.id !== m.id && (
                <button
                  type="button"
                  onClick={() => startRemove(m)}
                  title="Remove from group"
                  aria-label="Remove from group"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {removeTarget && (
          <div className="mt-4 rounded-2xl border border-foreground/20 p-4">
            <p className="mono text-xs uppercase leading-relaxed tracking-wider text-foreground">
              Remove {removeTarget.email}?{" "}
              {removeSets === null
                ? "Checking which sets leave with them…"
                : removeSets.count === 0
                  ? "They haven't shared any sets, so nothing else is affected."
                  : `${removeSets.count} set${
                      removeSets.count === 1 ? "" : "s"
                    } they shared leave the group with them:`}
            </p>
            {removeSets && removeSets.names.length > 0 && (
              <ul className="mono mt-3 list-disc space-y-1 pl-5 text-xs uppercase tracking-wider text-muted-foreground">
                {removeSets.names.map((n, i) => (
                  <li key={i} className="truncate">
                    {n}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={confirmRemove}
                disabled={removeSets === null}
                className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90 disabled:opacity-40"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => {
                  setRemoveTarget(null);
                  setRemoveSets(null);
                }}
                className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm transition hover:bg-foreground hover:text-background"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mono uppercase mt-3 text-[10px] tracking-wider text-[var(--brand-red)]">
            {error}
          </p>
        )}
        {done && (
          <p className="mono mt-3 text-xs uppercase tracking-wider text-muted-foreground">{done}</p>
        )}

        {!isInvite && (
          <div className="mt-8">
            {confirm === null ? (
              <button
                type="button"
                onClick={startDestroy}
                className="mono uppercase w-full rounded-full bg-[var(--brand-red)] py-2 text-sm tracking-wider text-[var(--brand-white)] transition hover:opacity-90"
              >
                {isOwner ? "Delete group" : "Leave group"}
              </button>
            ) : (
              <div className="rounded-2xl border border-foreground/20 p-4">
                <p className="mono text-xs uppercase leading-relaxed tracking-wider text-foreground">
                  {confirm === "delete"
                    ? "Delete this group for everyone? Sets return to their owners' personal catalogues."
                    : "Leave this group? The sets you shared in are removed from the group and return to your personal catalogue."}
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={confirm === "delete" ? destroy : leave}
                    className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90"
                  >
                    {confirm === "delete" ? "Delete" : "Leave"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm transition hover:bg-foreground hover:text-background"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
