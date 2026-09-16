import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/authStore";
import { useLibrary } from "@/lib/store";
import {
  fetchGroupMembers,
  inviteGroupMember,
  removeGroupMember,
  renameGroup,
  type GroupMember,
  type MyGroup,
} from "@/lib/sync";

/**
 * Manage a group's roster: the owner invites and removes members and can rename
 * or delete the group; any member can leave. Leaving or being removed keeps your
 * own sets in your personal library, and the group keeps the sets you shared in.
 */
export function GroupPanelDialog({
  open,
  onOpenChange,
  group,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: MyGroup;
  onChanged?: () => void;
}) {
  const session = useAuthStore((s) => s.session);
  const loadGroups = useLibrary((s) => s.loadGroups);
  const leaveGroupById = useLibrary((s) => s.leaveGroupById);
  const deleteGroupById = useLibrary((s) => s.deleteGroupById);
  const isOwner = !!session && group.owner_id === session.user.id;

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [name, setName] = useState(group.name);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(group.name);
    setEmail("");
    setError(null);
    setDone(null);
    setConfirm(null);
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
    setDone(`Invited ${e}.`);
    setEmail("");
    await refresh();
  };

  const remove = async (memberEmail: string) => {
    await removeGroupMember(group.id, memberEmail);
    setDone(`Removed ${memberEmail}.`);
    await refresh();
    onChanged?.();
  };

  const saveName = async () => {
    const n = name.trim();
    if (!n || n === group.name) return;
    await renameGroup(group.id, n);
    await loadGroups();
    setDone("Group renamed.");
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
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        <DialogTitle className="text-2xl font-normal leading-tight">
          {isOwner ? "Manage group" : group.name}
        </DialogTitle>

        {isOwner && (
          <div className="mt-6">
            <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Name
            </div>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                }}
                className="mono uppercase flex-1 rounded-full border border-foreground bg-background px-4 py-2 text-sm outline-none"
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
          </div>
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
              {m.isMe && (
                <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  You
                </span>
              )}
              {isOwner && !m.isMe && (
                <button
                  type="button"
                  onClick={() => remove(m.email)}
                  className="mono uppercase rounded-full bg-[var(--brand-red)] px-4 py-1.5 text-xs tracking-wider text-[var(--brand-white)] transition hover:opacity-90"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <>
            <div className="mono mb-2 mt-6 text-[10px] uppercase tracking-wider text-muted-foreground">
              Invite someone
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
              <button
                type="button"
                onClick={invite}
                disabled={busy || !email.trim()}
                className="mono uppercase rounded-full bg-foreground px-4 py-2 text-xs tracking-wider text-background transition hover:opacity-90 disabled:opacity-40"
              >
                Invite
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="mono uppercase mt-3 text-[10px] tracking-wider text-[var(--brand-red)]">
            {error}
          </p>
        )}
        {done && (
          <p className="mono mt-3 text-xs uppercase tracking-wider text-muted-foreground">{done}</p>
        )}

        <div className="mt-8">
          {confirm === null ? (
            <button
              type="button"
              onClick={() => setConfirm(isOwner ? "delete" : "leave")}
              className="mono uppercase w-full rounded-full bg-[var(--brand-red)] py-2 text-sm tracking-wider text-[var(--brand-white)] transition hover:opacity-90"
            >
              {isOwner ? "Delete group" : "Leave group"}
            </button>
          ) : (
            <div>
              <p className="mono mb-3 text-xs uppercase tracking-wider text-muted-foreground">
                {confirm === "delete"
                  ? "Delete this group for everyone? Sets return to their owners' personal libraries."
                  : "Leave this group? The sets you shared in are removed from the group (and from its gatherings) and return to your personal library."}
              </p>
              <div className="flex gap-3">
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
      </DialogContent>
    </Dialog>
  );
}
