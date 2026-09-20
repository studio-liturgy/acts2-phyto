import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { langDef, type LangCode } from "@/lib/langs";
import { inferredVersions, versionsMismatchWorkspace } from "@/lib/versions";
import { langOfTranslation } from "@/lib/bible";
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
}: {
  set: Pick<PhytoSet, "kind" | "versions" | "slides">;
  className?: string;
}) {
  const settings = useLibrary((s) => s.workspaceSettings);
  const versions = inferredVersions(set);
  // No verses, nothing to warn about (a set that had them all deleted).
  if (!set.slides.some((sl) => sl.kind === "scripture")) return null;
  if (!versionsMismatchWorkspace(versions, settings)) return null;

  // The set's languages (from its versions), each once.
  const setLangs = [
    ...new Set(
      versions!
        .map((code) => langOfTranslation(code))
        .filter((l): l is LangCode => !!l)
        .map((l) => langDef(l).label),
    ),
  ].join(" / ");
  const label = `This set is in ${setLangs}. Click edit to update.`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex shrink-0 ${className}`} aria-label={label}>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="mono text-[10px] uppercase tracking-wider">
          <span className="block">This set is in {setLangs}.</span>
          <span className="block">Click edit to update.</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
