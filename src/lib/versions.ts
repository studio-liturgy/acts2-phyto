// Scripture versions (bible translations) stacked on a slide, and which of
// them a WORKSPACE shows. A scripture set may carry two translations
// (`Set.versions`, one text per version on each verse slide); the workspace's
// settings decide what's projected: every version when multi-language is on,
// otherwise the one in the workspace's language (falling back to the set's
// primary). Groups get this for free: the set carries both, each member's
// workspace picks.

import type { Slide, Set as PhytoSet } from "./types";
import { langOfTranslation, type AlignedVerse } from "./bible";
import type { WorkspaceSettings } from "./workspace-settings";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Aligned verses to slides: one verse per slide, each carrying every stacked
 * translation. `lines` holds the primary translation so the phone view and the
 * thumbnails keep working.
 *
 * Every verse of the passage carries the whole passage's reference (e.g.
 * "John 3:1-2"), in each version's own language, rather than a per-verse ref,
 * so the import reads as one passage in the editor and on the slide.
 */
export function alignedVersesToSlides(
  rows: AlignedVerse[],
  versions: string[],
  references: Record<string, string>,
): Slide[] {
  const primary = versions[0];
  const referencesByVersion: Record<string, string> = {};
  for (const v of versions) referencesByVersion[v] = references[v] ?? references[primary] ?? "";
  return rows.map((row) => {
    const text = row.byVersion[primary] ?? Object.values(row.byVersion)[0] ?? "";
    return {
      id: uid(),
      kind: "scripture" as const,
      lines: text ? [text] : [],
      linesByVersion: row.byVersion,
      referencesByVersion,
      reference: referencesByVersion[primary],
    };
  });
}

/** One rendered line of a stacked scripture slide. */
export interface DisplayVerseLine {
  key: string;
  text: string;
  version: string;
  /** This version's own reference (localized book name), shown with the verse. */
  reference?: string;
}

/**
 * The translations to stack on a scripture slide, in the given order, skipping
 * any this verse has no text for (a verse with no match in the second
 * translation shows the first only).
 */
export function displayLinesForVersions(slide: Slide, versions: string[]): DisplayVerseLine[] {
  const byVersion = slide.linesByVersion;
  if (!byVersion) return [];
  const out: DisplayVerseLine[] = [];
  for (const version of versions) {
    const text = byVersion[version]?.trim();
    if (text)
      out.push({
        key: version,
        text,
        version,
        reference: slide.referencesByVersion?.[version] ?? slide.reference,
      });
  }
  return out;
}

/** Does this set stack translations at all? A set with one (or no) recorded
 *  version renders the plain way from `lines`, exactly as before versions. */
export function hasStackedVersions(
  set: Pick<PhytoSet, "versions" | "slides"> | undefined,
): boolean {
  return !!set && (set.versions?.length ?? 0) > 1 && set.slides.some((s) => !!s.linesByVersion);
}

/**
 * Which of a set's versions the workspace shows, in order. Undefined when the
 * set doesn't stack versions (render from `lines`). Multi-language on: all of
 * them. Off: the version whose translation is in the workspace's language, or
 * the set's primary when none is.
 */
export function visibleVersions(
  set: Pick<PhytoSet, "versions" | "slides"> | undefined,
  settings: WorkspaceSettings,
): string[] | undefined {
  if (!hasStackedVersions(set)) return undefined;
  const all = set!.versions!;
  if (settings.multiLanguage) return all;
  const match = all.find((code) => langOfTranslation(code) === settings.language);
  return [match ?? all[0]];
}
