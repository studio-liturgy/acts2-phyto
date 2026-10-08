// Scripture versions (bible translations) stacked on a slide. A scripture set
// may carry two translations (`Set.versions`, one text per version on each
// verse slide), switched on per set in its editor; every version a set carries
// is projected. The workspace's language doesn't restrict them.

import type { Slide } from "./types";
import {
  canonicalVersion,
  langOfTranslation,
  splitRefLabel,
  versionLanguageName,
  type AlignedVerse,
} from "./bible";
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
/** The shape the visibility rules need: the versions, and slides that may
 *  carry per-version text (the viewer's raw rows qualify too). */
export type VersionedSet = {
  versions?: string[];
  slides: Array<{ linesByVersion?: Record<string, string> }>;
};

export function hasStackedVersions(set: VersionedSet | null | undefined): boolean {
  return !!set && (set.versions?.length ?? 0) > 1 && set.slides.some((s) => !!s.linesByVersion);
}

/** The versions a set projects, in the set's order (its 1st version on top;
 *  "Swap versions" in the editor flips it). Undefined when the set doesn't
 *  stack versions (render from `lines`). */
export function visibleVersions(set: VersionedSet | null | undefined): string[] | undefined {
  return hasStackedVersions(set) ? set!.versions : undefined;
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

/** The reference queries to fetch again when a set is re-imported: one per
 *  passage CURRENTLY in the set (its verses' references, labels stripped of
 *  the version code), in order, the same passage twice when it was imported
 *  twice. The queries recorded at import are only a fallback for verses that
 *  carry no reference: they are a history, and would bring back passages
 *  the user has since deleted. */
export function reimportQueries(set: {
  scriptureImports?: string[];
  slides: Array<{ reference?: string; kind?: string; importIndex?: number; manual?: boolean }>;
}): string[] {
  const out: string[] = [];
  let lastImport: number | undefined;
  let lastRef: string | undefined;
  for (const s of set.slides) {
    // Hand-typed verses were never fetched, so there is nothing to fetch again.
    if (s.kind !== "scripture" || !s.reference || s.manual) continue;
    const { ref } = splitRefLabel(s.reference);
    if (!ref) continue;
    // A new passage: a new import, or (without import numbers) a new reference.
    const fresh = s.importIndex !== undefined ? s.importIndex !== lastImport : ref !== lastRef;
    if (fresh || out.length === 0) out.push(ref);
    lastImport = s.importIndex;
    lastRef = ref;
  }
  if (out.length) return out;
  return [...new Set(set.scriptureImports ?? [])];
}

/** "English / Japanese": the languages of a set's versions, each once. */
export function languagesOfVersions(versions: string[] | undefined): string {
  return [
    ...new Set(
      (versions ?? []).map((code) => versionLanguageName(code)).filter((l): l is string => !!l),
    ),
  ].join(" / ");
}

/** Workspace languages no longer restrict a set's versions (each set picks its
 *  own, one or two, from every language), so nothing is ever out of place. The
 *  mismatch warning, the frozen editor and Re-import / Duplicate stay wired to
 *  versionsMismatchWorkspace, dormant, for when system languages return. */
export const WORKSPACE_LANGUAGE_CHECKS = false;

/** Would the set's versions be wrong for this workspace? Never while
 *  WORKSPACE_LANGUAGE_CHECKS is off; see versionsOutsideLanguages. */
export function versionsMismatchWorkspace(
  versions: string[] | undefined,
  settings: WorkspaceSettings,
): boolean {
  return WORKSPACE_LANGUAGE_CHECKS && versionsOutsideLanguages(versions, settings);
}

/**
 * The rule the dormant mismatch check applies:
 *  - Multi-language: every version must be in one of the two languages (a
 *    Chinese / English set in a French / English workspace has a Chinese
 *    version that would be stacked). An English-only set is fine there.
 *  - Off: the set must have a version in the system language (extras are
 *    simply not projected, so French / English is fine in English).
 * False for sets that record no versions (nothing to judge).
 */
export function versionsOutsideLanguages(
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

/** The shape the version history reads: a set's kind, versions and verses,
 *  and when it was last changed. */
type HistorySet = {
  kind?: string;
  versions?: string[];
  slides: Array<{ reference?: string; kind?: string; linesByVersion?: Record<string, string> }>;
  updatedAt: number;
};

const newestFirst = (sets: readonly HistorySet[]) =>
  [...sets].sort((a, b) => b.updatedAt - a.updatedAt);

/** The bible versions used in previous sets, most recently changed set first
 *  (each set's versions in its own order), each once, at most `limit`. The
 *  version pickers list these on top; a new set starts in the first. A bolls
 *  code YouVersion took over is listed as YouVersion's ("NIV" -> "yv:111"),
 *  so new sets read from YouVersion. */
export function recentVersions(sets: readonly HistorySet[], limit = 5): string[] {
  const out: string[] = [];
  for (const set of newestFirst(sets)) {
    for (const code of (inferredVersions(set) ?? []).map(canonicalVersion)) {
      if (!out.includes(code)) out.push(code);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** The version to preselect when two versions are switched on beside `first`:
 *  the 2nd version of the most recent two-version set (its 1st when that is
 *  `first`), else the most recent other version used, else none. */
export function pairedVersion(sets: readonly HistorySet[], first: string): string | undefined {
  const mine = canonicalVersion(first);
  for (const set of newestFirst(sets)) {
    if (!hasStackedVersions(set)) continue;
    const [a, b] = set.versions!.map(canonicalVersion);
    const other = b !== mine ? b : a;
    if (other && other !== mine) return other;
  }
  return recentVersions(sets, Infinity).find((code) => code !== mine);
}
