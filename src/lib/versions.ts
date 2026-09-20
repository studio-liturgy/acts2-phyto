// Scripture versions (bible translations) stacked on a slide, and which of
// them a WORKSPACE shows. A scripture set may carry two translations
// (`Set.versions`, one text per version on each verse slide); the workspace's
// settings decide what's projected: every version when multi-language is on,
// otherwise the one in the workspace's language (falling back to the set's
// primary). Groups get this for free: the set carries both, each member's
// workspace picks.

import type { Slide } from "./types";
import { langOfTranslation, splitRefLabel, type AlignedVerse } from "./bible";
import type { WorkspaceSettings } from "./workspace-settings";
import { langDef, type LangCode } from "./langs";

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
 *  - Multi-language on: every version the set carries, in the SET's order
 *    (its 1st version on top; "Swap versions" flips it).
 *  - Off: the version in the workspace's system language; a set with none
 *    (it's flagged with a warning) shows everything it carries.
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
    // the editor flips it). A set that doesn't fit the workspace's languages
    // (it shows a warning) still projects everything it has.
    return all;
  }
  // Off: the version in the system language; a set that has none (warned)
  // still shows everything it has rather than a version picked at random.
  const match = inLang(settings.language);
  return match ? [match] : all;
}

/**
 * The bible versions a scripture/message set was imported in. Recorded on the
 * set for anything imported since versions existed; older single-version sets
 * carry the code in their reference label ("Psalms 100:4 NIV"), so it's read
 * from there. Undefined when nothing tells.
 */
export function inferredVersions(set: {
  kind?: string;
  versions?: string[];
  slides: Array<{ reference?: string; kind?: string }>;
}): string[] | undefined {
  if (set.versions?.length) return set.versions;
  if (set.kind !== "scripture" && set.kind !== "message") return undefined;
  const codes: string[] = [];
  for (const s of set.slides) {
    if (s.kind !== "scripture" || !s.reference) continue;
    const { code } = splitRefLabel(s.reference);
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes.length ? codes : undefined;
}

/** The reference queries to fetch again when a set is re-imported: the ones
 *  recorded at import, else the references on its verses (labels stripped of
 *  the version code), each once. */
export function reimportQueries(set: {
  scriptureImports?: string[];
  slides: Array<{ reference?: string; kind?: string }>;
}): string[] {
  if (set.scriptureImports?.length) return [...new Set(set.scriptureImports)];
  const out: string[] = [];
  for (const s of set.slides) {
    if (s.kind !== "scripture" || !s.reference) continue;
    const { ref } = splitRefLabel(s.reference);
    if (ref && !out.includes(ref)) out.push(ref);
  }
  return out;
}

/** "English / Japanese": the languages of a set's versions, each once. */
export function languagesOfVersions(versions: string[] | undefined): string {
  return [
    ...new Set(
      (versions ?? [])
        .map((code) => langOfTranslation(code))
        .filter((l): l is LangCode => !!l)
        .map((l) => langDef(l).label),
    ),
  ].join(" / ");
}

/**
 * Would the set's versions be wrong for this workspace?
 *  - Multi-language: every version must be in one of the two languages (a
 *    Chinese / English set in a French / English workspace has a Chinese
 *    version that would be stacked). An English-only set is fine there.
 *  - Off: the set must have a version in the system language (extras are
 *    simply not projected, so French / English is fine in English).
 * False for sets that record no versions (nothing to judge).
 */
export function versionsMismatchWorkspace(
  versions: string[] | undefined,
  settings: WorkspaceSettings,
): boolean {
  if (!versions?.length) return false;
  const langs = versions.map((code) => langOfTranslation(code));
  if (settings.multiLanguage) {
    const allowed = new Set([settings.language, settings.language2].filter(Boolean));
    return langs.some((l) => !l || !allowed.has(l));
  }
  return !langs.includes(settings.language);
}
