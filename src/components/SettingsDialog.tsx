import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuthStore, useIsSignedIn, useUserEmail } from "@/lib/authStore";
import { useLibrary } from "@/lib/store";
import { LANGS, isLangCode } from "@/lib/langs";
import { deleteAccount, fetchStorageUsage, formatBytes, type StorageUsage } from "@/lib/account";

const SECTION = "mono mb-3 text-[10px] uppercase tracking-wider text-muted-foreground";
const ROW = "flex items-center justify-between gap-4 py-2";
const LABEL = "mono text-xs uppercase tracking-wider";
const HINT = "mono mt-1 text-[10px] uppercase tracking-wider text-muted-foreground";

/**
 * Settings, opened from the header. Three groups:
 *  - Workspace: per-workspace preferences (multi-language, language) for the
 *    active workspace. A group's are the owner's to change; members read them.
 *  - Appearance: the light/dark theme (per device).
 *  - Account: storage used against the media quota, and account deletion.
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
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const activeWorkspace = useLibrary((s) => s.activeWorkspace);
  const activeWorkspaceName = useLibrary((s) => s.activeWorkspaceName);
  const groups = useLibrary((s) => s.groups);
  const settings = useLibrary((s) => s.workspaceSettings);
  const updateWorkspaceSettings = useLibrary((s) => s.updateWorkspaceSettings);
  const refreshWorkspaceSettings = useLibrary((s) => s.refreshWorkspaceSettings);

  const activeGroup = groups.find((g) => g.id === activeWorkspace);
  const workspaceLabel =
    activeWorkspace === "personal" ? "Personal" : (activeGroup?.name ?? activeWorkspaceName);
  const canEditWorkspace = isSignedIn && (!activeGroup || activeGroup.owner_id === userId);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSettingsError(null);
    setConfirmingDelete(false);
    setConfirmEmail("");
    setDeleteError(null);
    if (isSignedIn) {
      void refreshWorkspaceSettings();
      setUsage(null);
      fetchStorageUsage().then(setUsage);
    }
  }, [open, isSignedIn, refreshWorkspaceSettings]);

  const applyWorkspace = async (patch: Parameters<typeof updateWorkspaceSettings>[0]) => {
    setSettingsError(null);
    const ok = await updateWorkspaceSettings(patch);
    if (!ok) setSettingsError("Could not save. Check your connection and try again.");
  };

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

        {/* Workspace */}
        <div className="mt-6">
          <div className={SECTION}>Workspace: {workspaceLabel}</div>
          <div className={ROW}>
            <div>
              <div className={LABEL}>Multi-language</div>
              <div className={HINT}>
                {settings.multiLanguage
                  ? "Scriptures show every version they carry"
                  : "Scriptures show one version, in the workspace language"}
              </div>
            </div>
            <Switch
              checked={settings.multiLanguage}
              disabled={!canEditWorkspace}
              onCheckedChange={(on) => applyWorkspace({ multiLanguage: on })}
              aria-label="Multi-language"
            />
          </div>
          <div className={ROW}>
            <div className={LABEL}>Language</div>
            <select
              value={settings.language}
              disabled={!canEditWorkspace}
              onChange={(e) => {
                if (isLangCode(e.target.value)) applyWorkspace({ language: e.target.value });
              }}
              aria-label="Workspace language"
              className="mono rounded-full border border-foreground bg-background px-3 py-1.5 text-xs uppercase tracking-wider outline-none disabled:opacity-50"
            >
              {LANGS.filter((l) => !l.derivedFrom).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          {!isSignedIn && <p className={HINT}>Sign in to set workspace preferences.</p>}
          {isSignedIn && activeGroup && !canEditWorkspace && (
            <p className={HINT}>Only the group owner can change these.</p>
          )}
          {settingsError && (
            <p className="mono mt-1 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
              {settingsError}
            </p>
          )}
        </div>

        {/* Appearance */}
        <div className="mt-6">
          <div className={SECTION}>Appearance</div>
          <div className={ROW}>
            <div className={LABEL}>Light / dark mode</div>
            <ThemeToggle />
          </div>
        </div>

        {/* Account */}
        {isSignedIn && (
          <div className="mt-6">
            <div className={SECTION}>Account: {userEmail}</div>
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
              <div className={HINT}>Uploaded images and videos count; text does not.</div>
            </div>

            <div className="mt-4">
              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="mono uppercase rounded-full border border-[var(--brand-red)] px-4 py-1.5 text-xs tracking-wider text-[var(--brand-red)] transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                >
                  Delete account
                </button>
              ) : (
                <div className="rounded-2xl border border-[var(--brand-red)] p-4">
                  <div className={LABEL}>Delete this account?</div>
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
                    className="mono mt-3 w-full rounded-full border border-foreground bg-background px-4 py-2 text-sm outline-none"
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
