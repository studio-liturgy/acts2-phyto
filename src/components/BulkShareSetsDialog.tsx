import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/authStore";
import type { MyGroup } from "@/lib/sync";

/**
 * Share several owned sets at once (from the catalogue's edit mode). Add them to a
 * group (a grant per set) or share with a person by email. One email per person
 * grants two-way access to every selected set; the invite links to the app.
 */
export function BulkShareSetsDialog({
  open,
  onOpenChange,
  setIds,
  onShared,
  groups = [],
  onShareToGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setIds: string[];
  onShared?: () => void;
  groups?: MyGroup[];
  onShareToGroup?: (groupId: string) => Promise<void>;
}) {
  const session = useAuthStore((s) => s.session);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setError(null);
    setDone(null);
  }, [open]);

  const share = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !session || setIds.length === 0) return;
    setBusy(true);
    setError(null);
    setDone(null);
    if (e === (session.user.email ?? "").toLowerCase()) {
      setError("You can't share a set with yourself.");
      setBusy(false);
      return;
    }
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
    const rows = setIds.map((id) => ({
      set_id: id,
      owner_id: session.user.id,
      owner_email: session.user.email ?? null,
      grantee_email: e,
      grantee_user_id: granteeId as string,
    }));
    // Idempotent: skip sets already shared with this person.
    const { error: insErr } = await supabase
      .from("set_shares")
      .upsert(rows, { onConflict: "set_id,grantee_email", ignoreDuplicates: true });
    if (insErr) {
      setError("Could not share. Try again.");
      setBusy(false);
      return;
    }
    try {
      await fetch("/api/share/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, ownerEmail: session.user.email, count: setIds.length }),
      });
    } catch {
      // Ignore: the grants exist regardless of the email.
    }
    setBusy(false);
    setDone(e);
    setEmail("");
    onShared?.();
  };

  const label = `${setIds.length} set${setIds.length === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        <DialogTitle className="text-2xl font-normal leading-tight">Share {label}!</DialogTitle>
        <p className="mono uppercase mt-2 text-[10px] tracking-wider text-muted-foreground">
          Add them to a group, or share with a person. Either way they can be viewed, saved, and
          edited together.
        </p>

        {groups.length > 0 && onShareToGroup && (
          <div className="mt-6">
            <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Add to a group
            </div>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onShareToGroup(g.id)}
                  className="mono uppercase rounded-full border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
                >
                  {g.name}
                </button>
              ))}
            </div>
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
        {done && (
          <p className="mono mt-3 text-xs uppercase tracking-wider text-muted-foreground">
            Shared {label} with {done}. Add another email or close.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
