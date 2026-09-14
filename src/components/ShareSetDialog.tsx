import { useEffect, useState } from "react";
import { Copy, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/authStore";

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setId: string;
  setName: string;
}) {
  const session = useAuthStore((s) => s.session);
  const [email, setEmail] = useState("");
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setError(null);
    supabase
      .from("set_shares")
      .select("id, grantee_email")
      .eq("set_id", setId)
      .then(({ data }) => setShares((data ?? []) as ShareRow[]));
  }, [open, setId]);

  const share = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !session) return;
    setBusy(true);
    setError(null);
    const { data, error: insErr } = await supabase
      .from("set_shares")
      .insert({
        set_id: setId,
        owner_id: session.user.id,
        owner_email: session.user.email ?? null,
        grantee_email: e,
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

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${origin}/s/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        <DialogTitle className="text-2xl font-normal leading-tight">Share this set!</DialogTitle>
        <p className="mono uppercase mt-2 text-[10px] tracking-wider text-muted-foreground">
          People you add can view, save, and edit this set with you.
        </p>

        <div className="mt-6 flex items-center gap-2">
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
        {error && <p className="mt-2 text-xs text-[var(--brand-red)]">{error}</p>}

        {shares.length > 0 && (
          <ul className="mt-6 space-y-2">
            {shares.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="mono uppercase flex-1 truncate text-sm">{s.grantee_email}</span>
                <button
                  type="button"
                  onClick={() => copyLink(s.id)}
                  title="Copy invite link"
                  aria-label="Copy invite link"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground transition hover:bg-foreground hover:text-background"
                >
                  {copiedId === s.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => revoke(s.id)}
                  title="Revoke access"
                  aria-label="Revoke access"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
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
