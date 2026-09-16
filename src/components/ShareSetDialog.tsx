import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/authStore";
import {
  fetchRecentShareRecipients,
  shareSetToGroup,
  removeSetFromGroup,
  type MyGroup,
} from "@/lib/sync";

type ShareRow = { id: string; grantee_email: string };

/**
 * Share-a-set dialog: grant specific people two-way collaborative access to a set
 * by email. Each grant is a `set_shares` row (owner-only insert under RLS). The
 * invite email is best-effort; the copyable /s/<id> link is the same grant, so it
 * works whether the owner lets the app email it or sends it themselves.
 *
 * People you've shared with before appear as one-click rows below the email bar,
 * so you rarely have to retype an address.
 */
export function ShareSetDialog({
  open,
  onOpenChange,
  setId,
  setName,
  groups = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setId: string;
  setName: string;
  groups?: MyGroup[];
}) {
  const session = useAuthStore((s) => s.session);
  const [email, setEmail] = useState("");
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [groupGrants, setGroupGrants] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myEmail = (session?.user.email ?? "").toLowerCase();

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setError(null);
    supabase
      .from("set_shares")
      .select("id, grantee_email")
      .eq("set_id", setId)
      .then(({ data }) => setShares((data ?? []) as ShareRow[]));
    supabase
      .from("group_sets")
      .select("group_id")
      .eq("set_id", setId)
      .then(({ data }) =>
        setGroupGrants(((data ?? []) as { group_id: string }[]).map((r) => r.group_id)),
      );
    fetchRecentShareRecipients().then(setRecent);
  }, [open, setId]);

  const toggleGroup = async (groupId: string) => {
    if (groupGrants.includes(groupId)) {
      await removeSetFromGroup(setId, groupId);
      setGroupGrants((g) => g.filter((x) => x !== groupId));
    } else {
      await shareSetToGroup(setId, groupId);
      setGroupGrants((g) => [...g, groupId]);
    }
  };

  const shareWith = async (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (!e || !session || busy) return;
    setBusy(true);
    setError(null);
    if (e === myEmail) {
      setError("You can't share a set with yourself.");
      setBusy(false);
      return;
    }
    // Only share with people who already have an account. Resolving the email
    // also lets us attach the grant to them immediately (no claim needed).
    const { data: granteeId, error: lookupErr } = await supabase.rpc("user_id_for_email", {
      p_email: e,
    });
    if (lookupErr) {
      setError("Could not check this email. Try again.");
      setBusy(false);
      return;
    }
    if (!granteeId) {
      setError("This email doesn't have an account yet.");
      setBusy(false);
      return;
    }
    const { data, error: insErr } = await supabase
      .from("set_shares")
      .insert({
        set_id: setId,
        owner_id: session.user.id,
        owner_email: session.user.email ?? null,
        grantee_email: e,
        grantee_user_id: granteeId as string,
      })
      .select("id, grantee_email")
      .single();
    if (insErr || !data) {
      setError(
        insErr?.code === "23505"
          ? "Already shared with this email."
          : "Could not share. Try again.",
      );
      setBusy(false);
      return;
    }
    // Best-effort invite email; the grant already exists regardless.
    try {
      await fetch("/api/share/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: e,
          setName,
          shareId: (data as ShareRow).id,
          ownerEmail: session.user.email,
        }),
      });
    } catch {
      // Ignore: the person can still be reached via the copyable link.
    }
    setShares((prev) => [...prev, data as ShareRow]);
    setRecent((prev) => (prev.includes(e) ? prev : [e, ...prev]));
    setEmail("");
    setBusy(false);
  };

  const revoke = async (id: string) => {
    await supabase.from("set_shares").delete().eq("id", id);
    setShares((prev) => prev.filter((s) => s.id !== id));
  };

  // The people list: everyone I've shared with before, plus anyone already on
  // this set, as one row each (minus me). A row is a toggle — a green check when
  // this set is already shared with them (click to revoke), a + otherwise.
  const shareByEmail = new Map(shares.map((s) => [s.grantee_email.toLowerCase(), s]));
  const people = [
    ...new Set([...shares.map((s) => s.grantee_email.toLowerCase()), ...recent]),
  ].filter((e) => e && e !== myEmail);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        <DialogTitle className="text-2xl font-normal leading-tight">Share this set</DialogTitle>
        <p className="mono uppercase mt-2 text-[10px] tracking-wider text-muted-foreground">
          Anyone you add can view, save, and edit this set with you.
        </p>

        {groups.length > 0 && (
          <div className="mt-6">
            <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Groups
            </div>
            <ul className="space-y-2">
              {groups.map((g) => {
                const inGroup = groupGrants.includes(g.id);
                return (
                  <li key={g.id} className="flex items-center gap-2">
                    <span className="mono flex-1 truncate text-sm uppercase">{g.name}</span>
                    <ToggleAddButton
                      on={inGroup}
                      onClick={() => toggleGroup(g.id)}
                      addLabel="Add to group"
                      onLabel="Remove from group"
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mono mb-2 mt-6 text-[10px] uppercase tracking-wider text-muted-foreground">
          Share
        </div>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") shareWith(email);
            }}
            placeholder="name@email.com"
            className="mono uppercase flex-1 rounded-full border border-foreground bg-background px-4 py-2 text-sm outline-none"
          />
          <ToggleAddButton
            on={false}
            disabled={busy || !email.trim()}
            onClick={() => shareWith(email)}
            addLabel="Share with this email"
          />
        </div>
        {error && (
          <p className="mono uppercase mt-2 text-[10px] tracking-wider text-[var(--brand-red)]">
            {error}
          </p>
        )}

        {people.length > 0 && (
          <ul className="mt-4 space-y-2">
            {people.map((e) => {
              const row = shareByEmail.get(e);
              return (
                <li key={e} className="flex items-center gap-2">
                  <span className="mono uppercase flex-1 truncate text-sm">{e}</span>
                  <ToggleAddButton
                    on={!!row}
                    disabled={busy && !row}
                    onClick={() => (row ? revoke(row.id) : shareWith(e))}
                    addLabel="Share with this person"
                    onLabel="Sharing (click to revoke)"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A circle icon toggle: a + (outline) when off, a check on green when on. */
function ToggleAddButton({
  on,
  onClick,
  disabled = false,
  addLabel = "Add",
  onLabel = "Added",
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  addLabel?: string;
  onLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={on ? onLabel : addLabel}
      aria-label={on ? onLabel : addLabel}
      className={
        on
          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-green)] text-[var(--brand-white)] transition hover:opacity-90"
          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground text-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-40"
      }
    >
      {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
    </button>
  );
}
