import { LanguagePicker } from "@/components/LanguagePicker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const ROW = "flex items-center justify-between gap-4 py-2";
const LABEL = "mono text-xs uppercase tracking-wider";

/**
 * The per-workspace rows: the System language, frozen at English for now
 * (more languages are a work in progress, as hovering it says). Bible
 * versions don't depend on it: each scripture set picks its own, one or two,
 * from every language. Rendered in Settings for the personal workspace and in
 * a group's Manage panel. Carries its own TooltipProvider: the app has none at
 * the root.
 */
export function WorkspaceSettingsRows() {
  return (
    <div className={ROW}>
      <div className={LABEL}>System language</div>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* A disabled button fires no pointer events, so the wrapper
                takes the hover for the tooltip. Not focusable: the dialog
                focuses its first focusable element on open, which would open
                the tooltip without a hover. */}
            <span className="inline-flex cursor-not-allowed rounded-full">
              <LanguagePicker
                value="en"
                disabled
                onChange={() => {}}
                className="pointer-events-none"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="mono rounded-2xl border border-foreground bg-background p-3 text-[10px] uppercase tracking-wider text-foreground shadow-lg"
          >
            Work in progress: more languages coming soon
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
