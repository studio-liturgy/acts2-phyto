import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { langDef, type LangCode } from "@/lib/langs";
import { inferredVersions, versionsMismatchWorkspace } from "@/lib/versions";
import { useLibrary } from "@/lib/store";
import type { Set as PhytoSet } from "@/lib/types";

/**
 * Flags a scripture or message set whose bible versions are outside the
 * workspace's languages, so it's found in the catalogue rather than mid-service
 * when the slide comes up in the wrong language. Nothing when it matches, so
 * the list stays quiet in the normal case. Open the set and press Update to
 * re-import it. Carries its own TooltipProvider: the app has none at the root.
 */
export function VersionWarning({ set, className = "" }: { set: PhytoSet; className?: string }) {
  const settings = useLibrary((s) => s.workspaceSettings);
  const versions = inferredVersions(set);
  if (!versionsMismatchWorkspace(versions, settings)) return null;

  const wanted = [settings.language, settings.multiLanguage ? settings.language2 : null]
    .filter((l): l is LangCode => !!l)
    .map((l) => langDef(l).label)
    .join(" / ");
  const label = `Imported in ${versions!.join(" / ")}; this workspace uses ${wanted}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex shrink-0 ${className}`} aria-label={label}>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="block">Imported in {versions!.join(" / ")}</span>
          <span className="block">This workspace uses {wanted}</span>
          <span className="block opacity-70">Open the set and press Update</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
