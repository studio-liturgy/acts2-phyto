import { useState } from "react";
import { PillSwitch } from "@/components/PillSwitch";
import { LanguagePicker } from "@/components/LanguagePicker";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLibrary } from "@/lib/store";
import { WORKSPACE_LANGS, langDef, type LangCode } from "@/lib/langs";
import type { WorkspaceSettings } from "@/lib/workspace-settings";
import { inferredVersions, versionsMismatchWorkspace } from "@/lib/versions";

const ROW = "flex items-center justify-between gap-4 py-2";
const LABEL = "mono text-xs uppercase tracking-wider";

/** A 2nd language to start with when multi-language is switched on: the first
 *  in the list that isn't the 1st. */
function defaultSecond(first: LangCode): LangCode {
  return WORKSPACE_LANGS.find((l) => l.code !== first)?.code ?? first;
}

/**
 * The per-workspace rows for the ACTIVE workspace, wired to the store.
 * Multi-language off: a System language. On: a 1st and a 2nd language, both
 * required (the scripture importer offers each one's bible versions, and a
 * two-version scripture stacks the version in each, in that order). Rendered
 * in Settings for the personal workspace and in a group's Manage panel.
 */
export function WorkspaceSettingsRows({ disabled = false }: { disabled?: boolean }) {
  const settings = useLibrary((s) => s.workspaceSettings);
  const updateWorkspaceSettings = useLibrary((s) => s.updateWorkspaceSettings);
  const sets = useLibrary((s) => s.sets);
  const [error, setError] = useState<string | null>(null);
  // A language change while this workspace already holds imported scriptures:
  // those keep the bible versions they were imported in (nothing is rewritten);
  // only new imports follow the new language. Say so before applying.
  const [pending, setPending] = useState<{
    patch: Partial<WorkspaceSettings>;
    affected: number;
  } | null>(null);
  // How many of this workspace's scripture/message sets would be in a language
  // the workspace no longer names, once `patch` is applied.
  const wouldMismatch = (patch: Partial<WorkspaceSettings>) =>
    Object.values(sets).filter(
      (d) =>
        (d.kind === "scripture" || d.kind === "message") &&
        versionsMismatchWorkspace(inferredVersions(d), { ...settings, ...patch }),
    ).length;

  const apply = async (patch: Partial<WorkspaceSettings>) => {
    setError(null);
    const ok = await updateWorkspaceSettings(patch);
    if (!ok) setError("Could not save. Check your connection and try again.");
  };
  const applyLanguage = (patch: Partial<WorkspaceSettings>) => {
    const affected = wouldMismatch(patch);
    if (affected > 0) setPending({ patch, affected });
    else void apply(patch);
  };
  const importedScriptures = pending?.affected ?? 0;
  const pendingLabel = pending
    ? [pending.patch.language, pending.patch.language2]
        .filter((l): l is LangCode => !!l)
        .map((l) => langDef(l).label)
        .join(" and ")
    : "";

  const second = settings.language2 ?? defaultSecond(settings.language);

  return (
    <div>
      <div className={ROW}>
        <div className={LABEL}>Multi-language</div>
        <PillSwitch
          checked={settings.multiLanguage}
          disabled={disabled}
          onCheckedChange={(on) =>
            // Switching on fills in a 2nd language so both are always set.
            applyLanguage(
              on && !settings.language2
                ? { multiLanguage: true, language2: defaultSecond(settings.language) }
                : { multiLanguage: on },
            )
          }
          label="Multi-language"
        />
      </div>
      {settings.multiLanguage ? (
        <>
          <div className={ROW}>
            <div className={LABEL}>1st language</div>
            <LanguagePicker
              value={settings.language}
              disabled={disabled}
              onChange={(language) =>
                // The two must differ: picking the 2nd as the 1st swaps them.
                apply(
                  language === second ? { language, language2: settings.language } : { language },
                )
              }
            />
          </div>
          <div className={ROW}>
            <div className={LABEL}>2nd language</div>
            <LanguagePicker
              value={second}
              disabled={disabled}
              onChange={(language2) =>
                apply(
                  language2 === settings.language ? { language2, language: second } : { language2 },
                )
              }
            />
          </div>
        </>
      ) : (
        <div className={ROW}>
          <div className={LABEL}>System language</div>
          <LanguagePicker
            value={settings.language}
            disabled={disabled}
            onChange={(language) => applyLanguage({ language })}
          />
        </div>
      )}
      {error && (
        <p className="mono mt-1 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
          {error}
        </p>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            {pendingLabel ? `Change language to ${pendingLabel}?` : "Change languages?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            {importedScriptures === 1
              ? "1 scripture set you've already imported is in a language this workspace won't name; it keeps the bible versions it was imported in."
              : `${importedScriptures} scripture sets you've already imported are in a language this workspace won't name; they keep the bible versions they were imported in.`}{" "}
            Only new imports use the new language. To bring a set across, open it and press UPDATE.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                const patch = pending?.patch;
                setPending(null);
                if (patch) void apply(patch);
              }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
            >
              Change language
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
