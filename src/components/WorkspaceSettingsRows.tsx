import { useState } from "react";
import { PillSwitch } from "@/components/PillSwitch";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useLibrary } from "@/lib/store";
import { otherWorkspaceLang, type WorkspaceSettings } from "@/lib/workspace-settings";

const ROW = "flex items-center justify-between gap-4 py-2";
const LABEL = "mono text-xs uppercase tracking-wider";

/** A 2nd language to start with when multi-language is switched on: the first
 *  in the list that isn't the 1st. */
const defaultSecond = otherWorkspaceLang;

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
  const [error, setError] = useState<string | null>(null);
  const apply = async (patch: Partial<WorkspaceSettings>) => {
    setError(null);
    const ok = await updateWorkspaceSettings(patch);
    if (!ok) setError("Could not save. Check your connection and try again.");
  };
  // The note about existing sets appears once a language has been changed here.
  const [languageChanged, setLanguageChanged] = useState(false);
  const applyLanguage = (patch: Partial<WorkspaceSettings>) => {
    setLanguageChanged(true);
    return apply(patch);
  };

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
              on && (!settings.language2 || settings.language2 === settings.language)
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
              exclude={[settings.language]}
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
              exclude={[second]}
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
            exclude={[settings.language]}
            onChange={(language) => applyLanguage({ language })}
          />
        </div>
      )}
      {languageChanged && (
        <p className="mono mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          If Scripture sets are in a different language, they remain frozen until updated.
        </p>
      )}
      {error && (
        <p className="mono mt-1 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
