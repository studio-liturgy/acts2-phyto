// Scripture versions (bible translations) stacked on a slide, and which of
// them a WORKSPACE shows. A scripture set may carry two translations
// (`Set.versions`, one text per version on each verse slide); the workspace's
// settings decide what's projected: every version when multi-language is on,
// otherwise the one in the workspace's language (falling back to the set's
// primary). Groups get this for free: the set carries both, each member's
// workspace picks.

import type { Slide } from "./types";
import { langOfTranslation, type AlignedVerse } from "./bible";
import type { WorkspaceSettings } from "./workspace-settings";
import type { LangCode } from "./langs";

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
/** The shape the visibility rules need: the versions, and slides that may
 *  carry per-version text (the viewer's raw rows qualify too). */
export type VersionedSet = {
  versions?: string[];
  slides: Array<{ linesByVersion?: Record<string, string> }>;
};

export function hasStackedVersions(set: VersionedSet | null | undefined): boolean {
  return !!set && (set.versions?.length ?? 0) > 1 && set.slides.some((s) => !!s.linesByVersion);
}

/**
 * Which of a set's versions the workspace shows, in order. Undefined when the
 * set doesn't stack versions (render from `lines`).
 *  - Multi-language on: the set's versions that are in the workspace's two
 *    languages, in the SET's order (its 1st version on top). If the set has
 *    neither language (imported elsewhere), every version it carries.
 *  - Off: the version in the workspace's system language, or the set's
 *    primary when none is.
 */
export function visibleVersions(
  set: VersionedSet | null | undefined,
  settings: WorkspaceSettings,
): string[] | undefined {
  if (!hasStackedVersions(set)) return undefined;
  const all = set!.versions!;
  const inLang = (lang: LangCode | null) =>
    lang ? all.find((code) => langOfTranslation(code) === lang) : undefined;
  if (settings.multiLanguage) {
    // The set's own order (1st version on top, 2nd below; "Swap versions" in
    // the editor flips it), keeping the ones in the workspace's languages.
    const langs = new Set([settings.language, settings.language2].filter(Boolean));
    const picked = all.filter((code) => {
      const l = langOfTranslation(code);
      return !!l && langs.has(l);
    });
    return picked.length ? picked : all;
  }
  return [inLang(settings.language) ?? all[0]];
}

/**
 * Does the set's choice of bible versions sit outside the workspace's
 * languages? Multi-language on: any version in a language the workspace
 * doesn't name. Off: the primary version isn't in the system language. False
 * for sets that record no versions (nothing to update).
 */
export function versionsMismatchWorkspace(
  versions: string[] | undefined,
  settings: WorkspaceSettings,
): boolean {
  if (!versions?.length) return false;
  if (settings.multiLanguage) {
    const langs = new Set([settings.language, settings.language2].filter(Boolean));
    return versions.some((code) => {
      const l = langOfTranslation(code);
      return !l || !langs.has(l);
    });
  }
  return langOfTranslation(versions[0]) !== settings.language;
}
