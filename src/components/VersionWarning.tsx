import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { inferredVersions, languagesOfVersions, versionsMismatchWorkspace } from "@/lib/versions";
import { useLibrary } from "@/lib/store";
import type { Set as PhytoSet } from "@/lib/types";

/**
 * Flags a scripture or message set whose bible versions are outside the
 * workspace's languages, so it's found in the catalogue rather than mid-service
 * when the slide comes up in the wrong language. Nothing when it matches, so
 * the list stays quiet in the normal case. Open the set and press Update to
 * re-import it. Carries its own TooltipProvider: the app has none at the root.
 */
export function VersionWarning({
  set,
  className = "",
  hint = "Click edit to update.",
  silent = false,
}: {
  set: Pick<PhytoSet, "kind" | "versions" | "slides">;
  className?: string;
  /** The second line: where to go from here. */
  hint?: string;
  /** Just the triangle, no hover text (the presenter's sidebar). */
  silent?: boolean;
}) {
  const settings = useLibrary((s) => s.workspaceSettings);
  const versions = inferredVersions(set);
  // No verses, nothing to warn about (a set that had them all deleted).
  if (!set.slides.some((sl) => sl.kind === "scripture")) return null;
  if (!versionsMismatchWorkspace(versions, settings)) return null;

  if (silent) {
    return (
      <span
        className={`inline-flex shrink-0 ${className}`}
        aria-label="Versions outside this workspace"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
      </span>
    );
  }

  const setLangs = languagesOfVersions(versions);
  const label = `This set is in ${setLangs}. ${hint}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex shrink-0 ${className}`} aria-label={label}>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="mono rounded-2xl border border-foreground bg-background p-3 text-[10px] uppercase tracking-wider text-foreground shadow-lg"
        >
          <span className="block">This set is in {setLangs}.</span>
          <span className="block">{hint}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
