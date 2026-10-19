import { Switch } from "@/components/ui/switch";
import { useLibrary } from "@/lib/store";

const ROW = "flex items-center justify-between gap-4 py-2";
const LABEL = "mono text-xs uppercase tracking-wider";

/**
 * Settings → Arrangements, for the active workspace (personal in Settings, the
 * group in its Manage panel). On: songs in a gathering get arrangements (order,
 * repeats) in place of the eye's section hiding. Off: the eye comes back.
 */
export function ArrangementsSettingRow() {
  const on = useLibrary((s) => s.workspaceSettings.arrangements);
  const update = useLibrary((s) => s.updateWorkspaceSettings);
  return (
    <div className={ROW}>
      <div className={LABEL}>Arrangements</div>
      <Switch
        checked={on}
        onCheckedChange={(v) => void update({ arrangements: v })}
        aria-label="Arrangements"
      />
    </div>
  );
}
