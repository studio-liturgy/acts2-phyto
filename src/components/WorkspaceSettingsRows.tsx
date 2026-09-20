import { useState } from "react";
import { PillSwitch } from "@/components/PillSwitch";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useLibrary } from "@/lib/store";

const ROW = "flex items-center justify-between gap-4 py-2";
const LABEL = "mono text-xs uppercase tracking-wider";

/**
 * The two per-workspace rows (multi-language, language) for the ACTIVE
 * workspace, wired to the store. Rendered in Settings for the personal
 * workspace and in a group's Manage panel; `disabled` for members of a group,
 * whose owner is the only one who may change them.
 */
export function WorkspaceSettingsRows({ disabled = false }: { disabled?: boolean }) {
  const settings = useLibrary((s) => s.workspaceSettings);
  const updateWorkspaceSettings = useLibrary((s) => s.updateWorkspaceSettings);
  const [error, setError] = useState<string | null>(null);

  const apply = async (patch: Parameters<typeof updateWorkspaceSettings>[0]) => {
    setError(null);
    const ok = await updateWorkspaceSettings(patch);
    if (!ok) setError("Could not save. Check your connection and try again.");
  };

  return (
    <div>
      <div className={ROW}>
        <div className={LABEL}>Multi-language</div>
        <PillSwitch
          checked={settings.multiLanguage}
          disabled={disabled}
          onCheckedChange={(on) => apply({ multiLanguage: on })}
          label="Multi-language"
        />
      </div>
      <div className={ROW}>
        <div className={LABEL}>Language</div>
        <LanguagePicker
          value={settings.language}
          disabled={disabled}
          onChange={(language) => apply({ language })}
        />
      </div>
      {error && (
        <p className="mono mt-1 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
