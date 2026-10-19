import { useLibrary } from "@/lib/store";

const ROW = "flex min-h-11 items-center justify-between gap-4";
const LABEL = "mono text-xs uppercase tracking-wider";

/**
 * Settings → Arrangements, for the active workspace (personal in Settings, the
 * group in its Manage panel). On: songs in a gathering get arrangements (order,
 * repeats) in place of the eye's section hiding. Off: the eye comes back.
 * The switch is the light/dark toggle's (ThemeToggle), without the icon.
 */
export function ArrangementsSettingRow() {
  const on = useLibrary((s) => s.workspaceSettings.arrangements);
  const update = useLibrary((s) => s.updateWorkspaceSettings);
  return (
    <div className={ROW}>
      <div className={LABEL}>Arrangements</div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Arrangements"
        onClick={() => void update({ arrangements: !on })}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-current/40 bg-transparent transition-opacity duration-200 hover:opacity-80"
      >
        <span
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-current transition-all duration-200"
          style={{ left: on ? "calc(100% - 1.25rem - 2px)" : "2px" }}
        />
      </button>
    </div>
  );
}
