import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WorkspaceSettingsRows } from "@/components/WorkspaceSettingsRows";
import { useIsSignedIn, useUserEmail } from "@/lib/authStore";
import { useLibrary } from "@/lib/store";
import { deleteAccount, fetchStorageUsage, formatBytes, type StorageUsage } from "@/lib/account";

const ROW = "flex items-center justify-between gap-4 py-2";
const LABEL = "mono text-xs uppercase tracking-wider";
const GROUP = "mt-2";

/**
 * Settings, opened from the home header while in the Personal workspace (a
 * group's own settings live in its Manage panel). Personal multi-language and
 * language, the light/dark theme, storage used, and account deletion.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const isSignedIn = useIsSignedIn();
  const userEmail = useUserEmail();
  const refreshWorkspaceSettings = useLibrary((s) => s.refreshWorkspaceSettings);

  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmingDelete(false);
    setConfirmEmail("");
    setDeleteError(null);
    if (isSignedIn) {
      void refreshWorkspaceSettings();
      setUsage(null);
      fetchStorageUsage().then(setUsage);
    }
  }, [open, isSignedIn, refreshWorkspaceSettings]);

  const runDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const err = await deleteAccount(confirmEmail);
    setDeleting(false);
    if (err) {
      setDeleteError(err);
      return;
    }
    onOpenChange(false);
    navigate({ to: "/" });
  };

  const pct = usage && usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        <DialogTitle className="text-2xl font-normal leading-tight">Settings</DialogTitle>

        {/* Personal workspace settings work signed out too (kept on the device). */}
        <div className="mt-4">
          <WorkspaceSettingsRows />
        </div>

        <div className={GROUP}>
          <div className={ROW}>
            <div className={LABEL}>Light / dark mode</div>
            <ThemeToggle />
          </div>
        </div>

        {isSignedIn && (
          <div className={GROUP}>
            <div className="py-2">
              <div className="flex items-center justify-between gap-4">
                <div className={LABEL}>Storage</div>
                <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {usage
                    ? `${formatBytes(usage.used)} of ${formatBytes(usage.quota)} (${Math.round(pct)}%)`
                    : "Checking"}
                </div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/15">
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-500"
                  style={{ width: `${usage ? Math.max(pct, usage.used > 0 ? 1 : 0) : 0}%` }}
                />
              </div>
            </div>

            <div className="mt-3">
              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="mono uppercase w-full rounded-full border border-[var(--brand-red)] py-2 text-sm text-[var(--brand-red)] transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                >
                  Delete {userEmail}
                </button>
              ) : (
                <div className="rounded-2xl border border-[var(--brand-red)] p-4">
                  <div className={LABEL}>Delete {userEmail}?</div>
                  <p className="mt-2 text-sm">
                    This permanently deletes your sets, gatherings, uploaded media, shares, and any
                    groups you own (their members keep their own sets). It cannot be undone. Type
                    your email to confirm.
                  </p>
                  <input
                    autoFocus
                    type="email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    placeholder={userEmail ?? "your email"}
                    className="mono uppercase mt-3 w-full rounded-full border border-foreground bg-background px-4 py-2 text-sm outline-none"
                  />
                  {deleteError && (
                    <p className="mono mt-2 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
                      {deleteError}
                    </p>
                  )}
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      disabled={
                        deleting ||
                        confirmEmail.trim().toLowerCase() !== (userEmail ?? "").toLowerCase()
                      }
                      onClick={runDelete}
                      className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90 disabled:opacity-40"
                    >
                      {deleting ? "Deleting" : "Delete forever"}
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => {
                        setConfirmingDelete(false);
                        setConfirmEmail("");
                        setDeleteError(null);
                      }}
                      className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
