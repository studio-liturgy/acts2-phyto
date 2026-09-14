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
  sets = [],
  onShared,
  groups = [],
  onShareToGroup,
  onRemoveFromGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setIds: string[];
  sets?: { id: string; groupIds?: string[] }[];
  onShared?: () => void;
  groups?: MyGroup[];
  onShareToGroup?: (groupId: string) => Promise<void>;
  onRemoveFromGroup?: (groupId: string) => Promise<void>;
}) {
  const session = useAuthStore((s) => s.session);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const [groupDone, setGroupDone] = useState<string | null>(null);
  // Optimistic per-group membership after an Add/Remove, so the buttons flip
  // immediately instead of waiting for the liveQuery to catch up.
  const [localIn, setLocalIn] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setError(null);
    setDone(null);
    setGroupBusy(null);
    setGroupDone(null);
    setLocalIn({});
  }, [open]);

  const total = sets.length;
  const inGroupCount = (gid: string) => {
    const override = localIn[gid];
    if (override !== undefined) return override ? total : 0;
    return sets.filter((s) => (s.groupIds ?? []).includes(gid)).length;
  };

  const runGroup = async (
    gid: string,
    name: string,
    fn: (id: string) => Promise<void>,
    verb: string,
  ) => {
    if (groupBusy === gid) return; // ignore re-entrant clicks while this group is in flight
    // Flip the buttons immediately; the actual grant/retract runs in the
    // background so the UI never sits greyed while a large batch processes.
    setLocalIn((m) => ({ ...m, [gid]: verb === "Added" }));
    setGroupDone(`${verb} ${label} ${verb === "Added" ? "to" : "from"} ${name}.`);
    setGroupBusy(gid);
    try {
      await fn(gid);
    } catch {
      // Roll back the optimistic flip on failure.
      setLocalIn((m) => {
        const next = { ...m };
        delete next[gid];
        return next;
      });
      setGroupDone(null);
    } finally {
      setGroupBusy((b) => (b === gid ? null : b));
    }
  };

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
              Groups
            </div>
            <ul className="space-y-2">
              {groups.map((g) => {
                const inCount = inGroupCount(g.id);
                const canAdd = inCount < total; // some selected sets not yet in the group
                const canRemove = inCount > 0; // some selected sets are in the group
                return (
                  <li key={g.id} className="flex items-center gap-2">
                    <span className="mono flex-1 truncate text-sm uppercase">{g.name}</span>
                    {canAdd && (
                      <button
                        type="button"
                        onClick={() => runGroup(g.id, g.name, onShareToGroup, "Added")}
                        className="mono uppercase rounded-full bg-foreground px-4 py-1.5 text-xs tracking-wider text-background transition hover:opacity-90"
                      >
                        Add
                      </button>
                    )}
                    {canRemove && onRemoveFromGroup && (
                      <button
                        type="button"
                        onClick={() => runGroup(g.id, g.name, onRemoveFromGroup, "Removed")}
                        className="mono uppercase rounded-full border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {groupDone && (
              <p className="mono mt-3 text-xs uppercase tracking-wider text-muted-foreground">
                {groupDone}
              </p>
            )}
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
