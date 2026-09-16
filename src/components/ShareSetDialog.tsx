import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/authStore";
import { shareSetToGroup, removeSetFromGroup, type MyGroup } from "@/lib/sync";

type ShareRow = { id: string; grantee_email: string };

/**
 * Share-a-set dialog: grant specific people two-way collaborative access to a set
 * by email. Each grant is a `set_shares` row (owner-only insert under RLS). The
 * invite email is best-effort; the copyable /s/<id> link is the same grant, so it
 * works whether the owner lets the app email it or sends it themselves.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const share = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !session) return;
    setBusy(true);
    setError(null);
    if (e === (session.user.email ?? "").toLowerCase()) {
      setError("You can't share a set with yourself.");
      setBusy(false);
      return;
    }
    // Only share with people who already have a phyto account. Resolving the
    // email also lets us attach the grant to them immediately (no claim needed).
    const { data: granteeId, error: lookupErr } = await supabase.rpc("user_id_for_email", {
      p_email: e,
    });
    if (lookupErr) {
      setError("Could not check that email. Try again.");
      setBusy(false);
      return;
    }
    if (!granteeId) {
      setError("That email doesn't have a phyto account yet.");
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
          ? "Already shared with that email."
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
    setEmail("");
    setBusy(false);
  };

  const revoke = async (id: string) => {
    await supabase.from("set_shares").delete().eq("id", id);
    setShares((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        <DialogTitle className="text-2xl font-normal leading-tight">Share this set!</DialogTitle>
        <p className="mono uppercase mt-2 text-[10px] tracking-wider text-muted-foreground">
          People and groups you add can view, save, and edit this set with you.
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
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      className={`mono uppercase rounded-full px-4 py-1.5 text-xs tracking-wider transition ${
                        inGroup
                          ? "bg-[var(--brand-red)] text-[var(--brand-white)] hover:opacity-90"
                          : "bg-foreground text-background hover:opacity-90"
                      }`}
                    >
                      {inGroup ? "Remove" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mono mb-2 mt-6 text-[10px] uppercase tracking-wider text-muted-foreground">
          Share with a person
        </div>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") share();
            }}
            placeholder="name@email.com"
            className="mono uppercase flex-1 rounded-full border border-foreground bg-background px-4 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={share}
            disabled={busy || !email.trim()}
            className="mono uppercase rounded-full bg-foreground px-4 py-2 text-xs tracking-wider text-background transition hover:opacity-90 disabled:opacity-40"
          >
            Share
          </button>
        </div>
        {error && (
          <p className="mono uppercase mt-2 text-[10px] tracking-wider text-[var(--brand-red)]">
            {error}
          </p>
        )}

        {shares.length > 0 && (
          <ul className="mt-6 space-y-2">
            {shares.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="mono uppercase flex-1 truncate text-sm">{s.grantee_email}</span>
                <button
                  type="button"
                  onClick={() => revoke(s.id)}
                  title="Revoke access"
                  aria-label="Revoke access"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
