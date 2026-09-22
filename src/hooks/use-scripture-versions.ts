import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "@/lib/store";
import {
  alignVerses,
  fetchScriptureBolls,
  langOfTranslation,
  splitRefLabel,
  translationGroupsForLang,
  translationsForLang,
  TRANSLATION_CODES,
  withVersionCode,
} from "@/lib/bible";
import {
  fromVerseRows,
  parseScriptureFromText,
  reconcileSlideIds,
  scriptureHeader,
  slidesToScriptureText,
  slidesToVersionText,
  toVerseRows,
  versionTextToSlides,
  type VerseRow,
} from "@/lib/slide-text";
import {
  hasStackedVersions,
  inferredVersions,
  reimportQueries,
  versionsMismatchWorkspace,
  visibleVersions,
} from "@/lib/versions";
import type { SetKind, Slide } from "@/lib/types";
import type { LangCode } from "@/lib/langs";

/**
 * The scripture importer's state and behaviour, with the two-version support
 * ported from watch and wired to the workspace settings.
 *
 * Two modes, decided per set and workspace:
 *
 *  - LEGACY (multi-language off, and the set doesn't stack versions): the one
 *    text box, parsed with "verses per slide", exactly as phyto always worked.
 *    The translation picker only offers the workspace language's translations.
 *
 *  - BOXES (multi-language on, or the set already carries two versions): one
 *    box per version the workspace shows, paired verse by verse. Multi-language
 *    on shows and edits every version and offers a second-translation picker;
 *    off shows only the version in the workspace language while the other
 *    version's text is carried along untouched (merged back by verse position
 *    on every rebuild), so a set moving between workspaces never loses a
 *    translation.
 *
 * A message set keeps its verses on its slides (the block editor owns them);
 * this hook still drives its imports and version changes.
 */
/** A single group needs no heading. */
function ungroupSingle<T extends { language: string }>(groups: T[]): T[] {
  return groups.length === 1 ? [{ ...groups[0], language: "" }] : groups;
}

export function useScriptureVersions({ setId, kind }: { setId: string; kind: SetKind }) {
  const scriptureKind = kind === "scripture" || kind === "message";
  const updateSet = useLibrary((s) => s.updateSet);
  const settings = useLibrary((s) => s.workspaceSettings);
  const storedVersions = useLibrary((st) => st.sets[setId]?.versions);
  // Whether references carry their version code ("John 3:16 NIV"); on unless
  // the set says otherwise.
  const versionRefs = useLibrary((st) => st.sets[setId]?.versionRefs !== false);
  const storedImports = useLibrary((st) => st.sets[setId]?.scriptureImports);
  const storeSlides = useLibrary((s) => s.sets[setId]?.slides);
  const multi = settings.multiLanguage;

  const readSet = useCallback(() => useLibrary.getState().sets[setId], [setId]);

  // Each picker offers only its language's bible versions: the system
  // language's when multi-language is off, the 1st and 2nd languages' when on.
  const [translation, setTranslation] = useState(() => {
    const stored = readSet()?.versions?.[0];
    if (stored) return stored;
    return translationsForLang(settings.language)[0]?.code ?? "NIV";
  });
  // A new set starts with no 2nd version; a stored set keeps what it has.
  const [translation2, setTranslation2] = useState<string>(() => readSet()?.versions?.[1] ?? "");
  // The two languages take turns: whichever language the 1st version is in,
  // the 2nd version comes from the other. With no 2nd version chosen, the 1st
  // slot lists both languages (grouped, so the boundary is visible).
  const firstLang = useMemo<LangCode>(() => {
    if (!multi) return settings.language;
    const l = langOfTranslation(translation);
    return l === settings.language2 ? settings.language2 : settings.language;
  }, [multi, translation, settings.language, settings.language2]);
  const secondLang = useMemo<LangCode | null>(() => {
    if (!multi || !settings.language2) return null;
    return firstLang === settings.language ? settings.language2 : settings.language;
  }, [multi, firstLang, settings.language, settings.language2]);
  const secondChoices = useMemo(
    () => (secondLang ? translationsForLang(secondLang) : []),
    [secondLang],
  );
  /** The 2nd picker's list: one language, so ungrouped, except Chinese by
   *  script. */
  const secondGroups = useMemo(
    () => (secondLang ? ungroupSingle(translationGroupsForLang(secondLang)) : []),
    [secondLang],
  );
  const firstChoices = useMemo(
    () =>
      multi && !translation2 && settings.language2
        ? [...translationsForLang(settings.language), ...translationsForLang(settings.language2)]
        : translationsForLang(firstLang),
    [multi, translation2, settings.language, settings.language2, firstLang],
  );
  /** The 1st picker's list, grouped by language when it spans both (and
   *  Chinese always by script). A lone group carries no heading. */
  const firstGroups = useMemo(
    () =>
      ungroupSingle(
        multi && !translation2 && settings.language2
          ? [
              ...translationGroupsForLang(settings.language),
              ...translationGroupsForLang(settings.language2),
            ]
          : translationGroupsForLang(firstLang),
      ),
    [multi, translation2, settings.language, settings.language2, firstLang],
  );
  // Picking a 1st version in the other language moves the 2nd version over to
  // the remaining language (its first bible version), so the pair still spans
  // both languages. Only on the USER's pick: a workspace language change must
  // not silently re-fetch a set (that's what the Update prompt is for).
  const prevTranslation = useRef(translation);
  useEffect(() => {
    if (prevTranslation.current === translation) return;
    prevTranslation.current = translation;
    if (!multi || !translation2 || !secondLang) return;
    if (langOfTranslation(translation2) !== secondLang) {
      const first = translationsForLang(secondLang)[0]?.code;
      if (first && first !== translation) setTranslation2(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation]);
  // A set with no stored version follows the workspace's languages (a fresh
  // set opened in a Chinese workspace imports Chinese).
  useEffect(() => {
    if (storedVersions?.length) return;
    if (langOfTranslation(translation) !== settings.language) {
      const first = firstChoices[0]?.code;
      if (first) setTranslation(first);
    }
    // (A stored set's 2nd version is left alone here too: see the Update prompt.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.language, settings.language2, multi]);

  const stacked = hasStackedVersions(readSet());
  const boxMode = scriptureKind && (multi || stacked);
  const bilingual = boxMode && multi && !!translation2;

  // The versions this workspace edits, in order. Multi: the pickers' pair (or
  // one). Off but stacked: the one the workspace shows. Legacy: none.
  const editVersions = useMemo<string[]>(() => {
    if (!boxMode) return [];
    if (multi) return translation2 ? [translation, translation2] : [translation];
    return visibleVersions(readSet(), settings) ?? [translation];
  }, [boxMode, multi, translation, translation2, settings, readSet]);
  // The set's own first version: the one whose text also lives in `lines`.
  const primaryVersion = storedVersions?.[0] ?? editVersions[0] ?? translation;
  // The keys the boxes are read and written by: the edited versions, or the
  // one unnamed column of the legacy editor.
  const boxVersions = useMemo(() => (boxMode ? editVersions : ["_"]), [boxMode, editVersions]);

  // The boxes. In legacy mode only manualText is used (plain scripture text).
  const seedBoxes = useCallback(
    (slides: Slide[]): [string, string] => {
      const set = readSet();
      const vs = set?.versions ?? [];
      const wanted = boxMode ? (editVersions.length ? editVersions : vs) : [];
      if (boxMode && wanted.length && slides.some((s) => s.linesByVersion)) {
        const boxes = slidesToVersionText(slides, wanted);
        return [boxes[wanted[0]] ?? "", wanted[1] ? (boxes[wanted[1]] ?? "") : ""];
      }
      return [slidesToScriptureText(slides), ""];
    },
    [boxMode, editVersions, readSet],
  );
  const [manualText, setManualText] = useState(() =>
    scriptureKind ? seedBoxes(readSet()?.slides ?? [])[0] : "",
  );
  const [manualText2, setManualText2] = useState(() =>
    scriptureKind ? seedBoxes(readSet()?.slides ?? [])[1] : "",
  );

  // Late hydration: on a direct URL load Dexie may not have populated the store
  // yet, so the lazy initializers saw no slides. Seed once they appear, but
  // never over text already in the boxes.
  const hydrated = useRef(manualText !== "" || manualText2 !== "");
  useEffect(() => {
    if (hydrated.current || !scriptureKind) return;
    if (!storeSlides || storeSlides.length === 0) return;
    hydrated.current = true;
    if (manualText === "" && manualText2 === "") {
      const [a, b] = seedBoxes(storeSlides);
      setManualText(a);
      setManualText2(b);
    }
  }, [storeSlides, scriptureKind, manualText, manualText2, seedBoxes]);

  // Re-seed the boxes when what the workspace shows changes (multi-language
  // toggled, language changed) so they follow the visible versions.
  const editKey = editVersions.join("|");
  const lastEditKey = useRef(editKey);
  useEffect(() => {
    if (lastEditKey.current === editKey) return;
    lastEditKey.current = editKey;
    if (!scriptureKind || multi) return; // multi changes are the pickers' (handled below)
    const [a, b] = seedBoxes(readSet()?.slides ?? []);
    setManualText(a);
    setManualText2(b);
  }, [editKey, scriptureKind, multi, seedBoxes, readSet]);

  const [versesPer, setVersesPer] = useState(1);
  const [keepLineBreaks, setKeepLineBreaks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [alignNote, setAlignNote] = useState<string | null>(null);

  // Live sync: rebuild the slides from the boxes. Only a plain scripture set is
  // box-driven; a message's block editor owns its slides. Reconciled against
  // the stored slides so an unchanged round-trip keeps every id and skips the
  // write. Guarded against the message -> scripture flip: the boxes are seeded
  // from the verses on that transition instead of syncing an empty box over them.
  const lastKindRef = useRef(kind);
  useEffect(() => {
    if (kind !== "scripture") {
      lastKindRef.current = kind;
      return;
    }
    const current = readSet()?.slides ?? [];
    if (lastKindRef.current !== "scripture") {
      lastKindRef.current = kind;
      const [a, b] = seedBoxes(current);
      setManualText(a);
      setManualText2(b);
      return;
    }
    let parsed: Slide[];
    if (boxMode) {
      const boxes: Record<string, string> = { [editVersions[0]]: manualText };
      if (editVersions[1]) boxes[editVersions[1]] = manualText2;
      parsed =
        manualText.trim() || manualText2.trim() ? versionTextToSlides(boxes, editVersions) : [];
      parsed = mergeHiddenVersions(
        parsed,
        current,
        editVersions,
        primaryVersion,
        readSet()?.versions,
      );
    } else {
      parsed = manualText.trim() ? parseScriptureFromText(manualText, versesPer) : [];
    }
    const { slides, changed } = reconcileSlideIds(parsed, current);
    if (changed) updateSet(setId, { slides });
  }, [
    manualText,
    manualText2,
    versesPer,
    kind,
    setId,
    boxMode,
    editVersions,
    primaryVersion,
    updateSet,
    readSet,
    seedBoxes,
  ]);

  // Fetch one import's passage in the active version(s) as box text: one "---"
  // block per verse (or per `versesPer` verses for a single version), with a
  // "[reference]" header on the block that opens the import.
  const fetchImportBlocks = useCallback(
    async (q: string, v1: string, v2: string, vPer: number) => {
      if (v2) {
        const [first, second] = await Promise.all([
          fetchScriptureBolls(q, v1, { removeLineBreaks: !keepLineBreaks, hints: [v2] }),
          fetchScriptureBolls(q, v2, { removeLineBreaks: !keepLineBreaks, hints: [v1] }),
        ]);
        const { rows, unmatched } = alignVerses(
          { code: v1, verses: first.verses },
          { code: v2, verses: second.verses },
        );
        // "Verses per slide" applies to the aligned pairs: each block holds the
        // same verses in both versions.
        const b1: string[] = [];
        const b2: string[] = [];
        for (let i = 0; i < rows.length; i += vPer) {
          const chunk = rows.slice(i, i + vPer);
          const t1 = chunk
            .map((r) => r.byVersion[v1] ?? "")
            .filter(Boolean)
            .join(" ");
          const t2 = chunk
            .map((r) => r.byVersion[v2] ?? "")
            .filter(Boolean)
            .join(" ");
          // The version code rides with the reference ("John 3:16 NIV"), on the
          // editor's reference line and on the slide, unless the set turned
          // version references off.
          b1.push(i === 0 ? `[${withVersionCode(first.reference, v1, versionRefs)}]\n${t1}` : t1);
          b2.push(i === 0 ? `[${withVersionCode(second.reference, v2, versionRefs)}]\n${t2}` : t2);
        }
        return {
          box1: b1.join("\n---\n"),
          box2: b2.join("\n---\n"),
          unmatched,
          ref1: first.reference,
        };
      }
      const { reference, verses } = await fetchScriptureBolls(q, v1, {
        removeLineBreaks: !keepLineBreaks,
      });
      const b1: string[] = [];
      for (let i = 0; i < verses.length; i += vPer) {
        const group = verses
          .slice(i, i + vPer)
          .map((x) => x.text.trim())
          .join(" ");
        b1.push(i === 0 ? `[${withVersionCode(reference, v1, versionRefs)}]\n${group}` : group);
      }
      return { box1: b1.join("\n---\n"), box2: "", unmatched: 0, ref1: reference };
    },
    [keepLineBreaks, versionRefs],
  );

  const joinBlocks = (prev: string, add: string) =>
    prev.trim() && add ? `${prev}\n---\n${add}` : prev.trim() || add;

  const noteUnmatched = (unmatched: number, v1: string, v2: string) => {
    if (unmatched > 0)
      setAlignNote(
        `${unmatched} verse${unmatched === 1 ? " has" : "s have"} no match in ${v2}. ` +
          `Those slides show ${v1} only.`,
      );
  };

  /** Import the reference query into the set. */
  const importScripture = async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setErr(null);
    setAlignNote(null);
    try {
      const v1 = translation;
      const v2 = multi ? translation2 : "";
      const versions = v2 ? [v1, v2] : [v1];
      // Two stacked versions: at most two verses per slide.
      const vPer = v2 ? Math.min(versesPer, 2) : versesPer;

      if (kind === "message") {
        // A message owns its slides: append a fresh verse block (its own
        // importIndex) at the end; the user drags it into place.
        const b = await fetchImportBlocks(q, v1, v2, vPer);
        const existing = readSet()?.slides ?? [];
        const built = boxMode
          ? versionTextToSlides(v2 ? { [v1]: b.box1, [v2]: b.box2 } : { [v1]: b.box1 }, versions)
          : parseScriptureFromText(b.box1, vPer);
        const nextIdx = existing.reduce((m, s) => Math.max(m, s.importIndex ?? 0), -1) + 1;
        updateSet(setId, {
          slides: [...existing, ...built.map((s) => ({ ...s, importIndex: nextIdx }))],
          ...(boxMode ? { versions, scriptureImports: [...(storedImports ?? []), q] } : {}),
        });
        noteUnmatched(b.unmatched, v1, v2);
        return;
      }

      if (boxMode) {
        // A box per version; remember the query so the version can be changed
        // later (re-fetching), and a repeat import adds a fresh group.
        const b = await fetchImportBlocks(q, v1, v2, vPer);
        const hadText = manualText.trim() !== "" || manualText2.trim() !== "";
        setManualText((prev) => joinBlocks(prev, b.box1));
        if (v2) setManualText2((prev) => joinBlocks(prev, b.box2));
        const patch: Partial<{ versions: string[]; scriptureImports: string[]; name: string }> = {
          scriptureImports: [...(storedImports ?? []), q],
        };
        // Off but stacked: the set keeps its own versions; the import adds the
        // visible one only. Multi: the pickers define the versions.
        if (multi) patch.versions = versions;
        if (!hadText) patch.name = `${b.ref1} ${v1}${v2 ? ` / ${v2}` : ""}`;
        updateSet(setId, patch);
        noteUnmatched(b.unmatched, v1, v2);
        return;
      }

      // Legacy: a single passage in one version, written to the textarea.
      const { reference, verses } = await fetchScriptureBolls(q, v1, {
        removeLineBreaks: !keepLineBreaks,
      });
      const labelled = withVersionCode(reference, v1, versionRefs);
      const parts: string[] = [];
      for (let i = 0; i < verses.length; i += versesPer) {
        if (i > 0) parts.push("---");
        const group = verses.slice(i, i + versesPer);
        const verseTexts = group.map((v) => v.text.trim()).join(" ");
        parts.push(i === 0 ? `[${labelled}]\n${verseTexts}` : verseTexts);
      }
      const newBlock = parts.join("\n\n");
      setManualText((prev) => (prev.trim() ? `${prev}\n\n---\n\n${newBlock}` : newBlock));
      // Title stays as the first passage imported.
      if (!manualText.trim()) updateSet(setId, { name: labelled });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * The boxes fetched again in `v1`/`v2`, passage by passage in their current
   * order. Every fetched passage (a group opened by a `[ref]` header) is
   * re-fetched from its reference; a hand-typed group (`[~ref]`) is carried
   * over as it is, its columns simply re-labelled with the new versions, since
   * a version change is about what was fetched, not what someone wrote.
   */
  const buildBoxes = async (v1: string, v2: string) => {
    const oldVersions = boxVersions;
    const newVersions = v2 ? [v1, v2] : [v1];
    const rows = toVerseRows(
      Object.fromEntries(oldVersions.map((v, i) => [v, i === 0 ? manualText : manualText2])),
      oldVersions,
    );
    const groups: VerseRow[][] = [];
    for (const r of rows) {
      if (r.starts || groups.length === 0) groups.push([r]);
      else groups[groups.length - 1].push(r);
    }
    let box1 = "";
    let box2 = "";
    let unmatched = 0;
    const vPer = v2 ? Math.min(versesPer, 2) : versesPer;
    for (const group of groups) {
      const query = splitRefLabel(group[0].refs[oldVersions[0]] ?? "").ref;
      if (group[0].manual || !query) {
        // Column i of the old versions becomes column i of the new.
        const carried = group.map((r) => ({
          ...r,
          refs: Object.fromEntries(newVersions.map((v, i) => [v, r.refs[oldVersions[i]] ?? ""])),
          text: Object.fromEntries(newVersions.map((v, i) => [v, r.text[oldVersions[i]] ?? ""])),
        }));
        const boxes = fromVerseRows(carried, newVersions);
        box1 = joinBlocks(box1, boxes[v1]);
        if (v2) box2 = joinBlocks(box2, boxes[v2]);
        continue;
      }
      const b = await fetchImportBlocks(query, v1, v2, vPer);
      box1 = joinBlocks(box1, b.box1);
      if (v2) box2 = joinBlocks(box2, b.box2);
      unmatched += b.unmatched;
    }
    return { box1, box2, unmatched };
  };

  // Multi-language: changing a version after importing re-fetches the passages
  // that currently exist in the new translation (hand-typed verses stay).
  // Skips the initial mount, and swaps update the marker themselves since they
  // reorder text in place.
  const rebuildScripture = async (v1: string, v2: string) => {
    setBusy(true);
    setErr(null);
    setAlignNote(null);
    try {
      const { box1, box2, unmatched } = await buildBoxes(v1, v2);
      setManualText(box1);
      setManualText2(v2 ? box2 : "");
      noteUnmatched(unmatched, v1, v2);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A message keeps its verses on its slides: re-fetch each existing block in
  // place (keeping its position and the points/images around it).
  /** A message's slides fetched again in `v1`/`v2`: each verse block in
   *  place (keeping its position and the points/images around it). */
  const buildMessageSlides = async (cur: Slide[], v1: string, v2: string) => {
    const newVersions = v2 ? [v1, v2] : [v1];
    // A hand-typed verse keeps its text; column i of the versions it was
    // written in becomes column i of the new versions.
    const oldVersions = storedVersions?.length ? storedVersions : boxVersions;
    const carry = (sl: Slide): Slide => {
      const textOf = (i: number) =>
        sl.linesByVersion?.[oldVersions[i]] ?? (i === 0 ? (sl.lines?.[0] ?? "") : "");
      const refOf = (i: number) =>
        sl.referencesByVersion?.[oldVersions[i]] ?? (i === 0 ? sl.reference : undefined);
      const linesByVersion: Record<string, string> = {};
      const referencesByVersion: Record<string, string> = {};
      newVersions.forEach((v, i) => {
        const t = textOf(i);
        if (t) linesByVersion[v] = t;
        const r = refOf(i);
        if (r) referencesByVersion[v] = r;
      });
      return {
        ...sl,
        lines: linesByVersion[v1] ? [linesByVersion[v1]] : [],
        linesByVersion,
        referencesByVersion,
        reference: referencesByVersion[v1],
        section: referencesByVersion[v1],
      };
    };
    const result: Slide[] = [];
    let unmatched = 0;
    let i = 0;
    while (i < cur.length) {
      const s = cur[i];
      if (s.kind !== "scripture") {
        result.push(s);
        i++;
        continue;
      }
      const idx = s.importIndex;
      const run: Slide[] = [];
      while (i < cur.length && cur[i].kind === "scripture" && cur[i].importIndex === idx) {
        run.push(cur[i]);
        i++;
      }
      const query = splitRefLabel(
        run[0].reference ?? Object.values(run[0].referencesByVersion ?? {})[0] ?? "",
      ).ref;
      if (run[0].manual || !query) {
        result.push(...run.map(carry));
        continue;
      }
      const b = await fetchImportBlocks(query, v1, v2, v2 ? Math.min(versesPer, 2) : versesPer);
      unmatched += b.unmatched;
      const built = versionTextToSlides(
        v2 ? { [v1]: b.box1, [v2]: b.box2 } : { [v1]: b.box1 },
        newVersions,
      ).map((x) => ({ ...x, importIndex: idx ?? 0 }));
      result.push(...built);
    }
    return { slides: result, unmatched };
  };

  const rebuildMessageVersions = async (v1: string, v2: string) => {
    const newVersions = v2 ? [v1, v2] : [v1];
    const cur = readSet()?.slides ?? [];
    setBusy(true);
    setErr(null);
    setAlignNote(null);
    try {
      const { slides, unmatched } = await buildMessageSlides(cur, v1, v2);
      updateSet(setId, { slides, versions: newVersions });
      noteUnmatched(unmatched, v1, v2);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickerKey = multi
    ? (translation2 ? [translation, translation2] : [translation]).join("|")
    : "";
  const prevPickerKey = useRef<string | null>(null);
  useEffect(() => {
    if (!multi || !scriptureKind) return;
    if (prevPickerKey.current === null) {
      prevPickerKey.current = pickerKey;
      return;
    }
    if (prevPickerKey.current === pickerKey) return;
    prevPickerKey.current = pickerKey;
    const v2 = translation2;
    if (kind === "message") {
      void rebuildMessageVersions(translation, v2);
      return;
    }
    // Re-fetch the passages that CURRENTLY exist (the [ref] headers in the
    // box, not hand-typed [~ref] ones), not the full import history, so a
    // deleted passage stays deleted.
    const currentRefs = [
      ...new Set(
        toVerseRows({ [boxVersions[0]]: manualText }, [boxVersions[0]])
          .filter((r) => r.starts && !r.manual)
          .map((r) => splitRefLabel(r.refs[boxVersions[0]] ?? "").ref)
          .filter((r) => !!r),
      ),
    ];
    updateSet(setId, {
      versions: v2 ? [translation, v2] : [translation],
      scriptureImports: currentRefs,
    });
    void rebuildScripture(translation, v2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerKey, multi, scriptureKind]);

  /** Swap which translation is first: codes, boxes and stored order flip together. */
  const swapVersions = () => {
    if (!bilingual) return;
    const [t1, t2, m1, m2] = [translation, translation2, manualText, manualText2];
    prevPickerKey.current = [t2, t1].join("|");
    setTranslation(t2);
    setTranslation2(t1);
    setManualText(m2);
    setManualText2(m1);
    updateSet(setId, { versions: [t2, t1] });
  };

  // The set's versions sit outside the workspace's languages (the workspace
  // changed language after this set was imported). "Update versions" re-fetches
  // its passages in the workspace's languages' first bibles; the boxes (and any
  // manual verse edits) are rebuilt from bolls.
  const inferred = useMemo(
    () => inferredVersions({ kind, versions: storedVersions, slides: storeSlides ?? [] }),
    [kind, storedVersions, storeSlides],
  );
  const hasVerses = (storeSlides ?? []).some((sl) => sl.kind === "scripture");
  const versionsMismatch = hasVerses && versionsMismatchWorkspace(inferred, settings);
  // Importing more is frozen until the mismatch is resolved: UPDATE, or every
  // verse removed (which also clears the set's recorded versions below).
  const frozen = versionsMismatch;
  // Only once the boxes are empty too: an import records the versions a
  // render before its verses land, and clearing on that render lost the 2nd
  // version of a set's first import (it only showed up with the next one).
  const boxesEmpty = manualText.trim() === "" && manualText2.trim() === "";
  useEffect(() => {
    if (!scriptureKind || hasVerses || !boxesEmpty) return;
    if (storedVersions?.length || storedImports?.length) {
      updateSet(setId, { versions: undefined, scriptureImports: undefined });
    }
  }, [scriptureKind, hasVerses, boxesEmpty, storedVersions, storedImports, setId, updateSet]);
  // What Update re-imports in: a version already in one of the workspace's
  // languages is kept; the other slot gets the remaining language's first
  // bible. A single-version set stays single.
  const workspaceVersions = useMemo(() => {
    const first = (l: LangCode | null) => (l ? (translationsForLang(l)[0]?.code ?? "") : "");
    if (!multi || !settings.language2) {
      const keep = langOfTranslation(translation) === settings.language;
      return { v1: keep ? translation : first(settings.language) || "NIV", v2: "" };
    }
    const langs: LangCode[] = [settings.language, settings.language2];
    const l1 = langOfTranslation(translation);
    const keep1 = !!l1 && langs.includes(l1);
    const v1 = keep1 ? translation : first(settings.language) || "NIV";
    const lang1: LangCode = keep1 && l1 ? l1 : settings.language;
    const remaining: LangCode =
      lang1 === settings.language ? settings.language2 : settings.language;
    // A single-version set stays single (2nd version: none).
    if (!translation2) return { v1, v2: "" };
    const v2 = langOfTranslation(translation2) === remaining ? translation2 : first(remaining);
    return { v1, v2: v2 === v1 ? "" : v2 };
  }, [multi, settings.language, settings.language2, translation, translation2]);
  /** The Update dialog's picker lists, following the importer's rule: the
   *  two languages take turns. Given the dialog's current 1st pick, the 2nd
   *  slot offers the other language; with no 2nd chosen, the 1st slot lists
   *  both languages grouped, else its own language. */
  const updateGroupsFor = useCallback(
    (v1: string, v2: string) => {
      const groupFor = (l: LangCode | null) => (l ? translationGroupsForLang(l) : []);
      if (!multi || !settings.language2) {
        return { first: groupFor(settings.language), second: [] as ReturnType<typeof groupFor> };
      }
      const l1 = langOfTranslation(v1);
      const firstLang = l1 === settings.language2 ? settings.language2 : settings.language;
      const other = firstLang === settings.language ? settings.language2 : settings.language;
      return {
        first: v2
          ? groupFor(firstLang)
          : [...groupFor(settings.language), ...groupFor(settings.language2)],
        second: groupFor(other),
      };
    },
    [multi, settings.language, settings.language2],
  );

  const updateVersionsToWorkspace = async (
    v1: string = workspaceVersions.v1,
    v2: string = workspaceVersions.v2,
  ) => {
    // Take over the pickers without the picker effect re-fetching on top.
    prevPickerKey.current = (v2 ? [v1, v2] : [v1]).join("|");
    setTranslation(v1);
    setTranslation2(v2);
    // From scratch: the passages recorded at import (else the references on
    // the verses, minus any version label), fetched again whole, so merged or
    // edited verses come back as the translation has them.
    const set = readSet();
    const refs = reimportQueries({ scriptureImports: storedImports, slides: set?.slides ?? [] });
    const hasManual = (set?.slides ?? []).some((sl) => sl.kind === "scripture" && sl.manual);
    if (!refs.length && !hasManual) return;
    if (kind === "message") {
      await rebuildMessageVersions(v1, v2);
      // The record of imports follows what's in the set now.
      updateSet(setId, { scriptureImports: refs });
    } else {
      updateSet(setId, { versions: v2 ? [v1, v2] : [v1], scriptureImports: refs });
      await rebuildScripture(v1, v2);
    }
    // The name names the versions ("John 3:16 NIV / CUNPS"): update it too.
    const name = readSet()?.name ?? "";
    const renamed = renameVersions(name, v1, v2);
    if (renamed !== name) updateSet(setId, { name: renamed });
  };

  /**
   * A COPY of this set in `v1`/`v2`, leaving this one as it is: every passage
   * fetched again (a message keeps its points and images in place). The copy
   * is a new set of mine in the current workspace, named for its versions.
   * Returns the copy's id, or null when nothing could be built.
   */
  const duplicateToVersions = async (v1: string, v2: string): Promise<string | null> => {
    const set = readSet();
    if (!set) return null;
    const refs = reimportQueries({ scriptureImports: storedImports, slides: set.slides });
    const hasManual = set.slides.some((sl) => sl.kind === "scripture" && sl.manual);
    if (!refs.length && !hasManual) return null;
    const newVersions = v2 ? [v1, v2] : [v1];
    setBusy(true);
    setErr(null);
    setAlignNote(null);
    try {
      let slides: Slide[];
      let unmatched = 0;
      if (kind === "message") {
        ({ slides, unmatched } = await buildMessageSlides(set.slides, v1, v2));
      } else {
        const b = await buildBoxes(v1, v2);
        unmatched = b.unmatched;
        slides = versionTextToSlides(
          v2 ? { [v1]: b.box1, [v2]: b.box2 } : { [v1]: b.box1 },
          newVersions,
        );
      }
      const {
        id: _id,
        createdAt: _c,
        updatedAt: _u,
        shared: _s,
        shared_by: _sb,
        groupIds: _g,
        group_id: _gid,
        ...rest
      } = set;
      const id = useLibrary.getState().createSet({
        ...rest,
        name: renameVersions(set.name, v1, v2),
        slides,
        versions: newVersions,
        scriptureImports: refs,
      });
      noteUnmatched(unmatched, v1, v2);
      return id;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Turn version codes on references on or off for this set: new imports
   * follow it, and every fetched passage already in the set is relabelled now
   * (hand-typed references are left as written). A scripture set's boxes are
   * rewritten header by header, a message's verse slides in place.
   */
  const setVersionRefs = (on: boolean) => {
    updateSet(setId, { versionRefs: on });
    if (!scriptureKind) return;
    // The code a column's references carry: its version, or the picker's in
    // the one unnamed column of the legacy editor.
    const codeFor = (v: string) => (v === "_" ? translation : v);
    if (kind === "message") {
      const cur = readSet()?.slides ?? [];
      const primary = storedVersions?.[0] ?? translation;
      updateSet(setId, {
        slides: cur.map((sl) => {
          if (sl.kind !== "scripture" || sl.manual) return sl;
          const referencesByVersion = Object.fromEntries(
            Object.entries(sl.referencesByVersion ?? {}).map(([v, r]) => [
              v,
              withVersionCode(r, codeFor(v), on),
            ]),
          );
          const reference =
            referencesByVersion[primary] ??
            (sl.reference ? withVersionCode(sl.reference, primary, on) : undefined);
          return {
            ...sl,
            ...(sl.referencesByVersion ? { referencesByVersion } : {}),
            reference,
            section: reference,
          };
        }),
      });
      return;
    }
    const rows = toVerseRows(
      Object.fromEntries(boxVersions.map((v, i) => [v, i === 0 ? manualText : manualText2])),
      boxVersions,
    ).map((r) =>
      r.manual
        ? r
        : {
            ...r,
            refs: Object.fromEntries(
              boxVersions.map((v) => [
                v,
                r.refs[v] ? withVersionCode(r.refs[v], codeFor(v), on) : r.refs[v],
              ]),
            ),
          },
    );
    const boxes = fromVerseRows(rows, boxVersions);
    setManualText(boxes[boxVersions[0]] ?? "");
    if (boxVersions[1]) setManualText2(boxes[boxVersions[1]] ?? "");
  };

  /**
   * A blank hand-typed verse at the end of the set: its reference and text are
   * typed in (a column per version the workspace edits) rather than fetched.
   * A scripture set gets a `[~]` block in each box; a message gets a slide.
   * In a multi-language workspace the set records the pickers' versions, the
   * way an import does, so the second column projects.
   */
  const addManualVerse = () => {
    if (!scriptureKind) return;
    const versions =
      multi && boxMode ? (translation2 ? [translation, translation2] : [translation]) : undefined;
    if (kind === "message") {
      const existing = readSet()?.slides ?? [];
      const nextIdx = existing.reduce((m, s) => Math.max(m, s.importIndex ?? 0), -1) + 1;
      const slide: Slide = {
        id: Math.random().toString(36).slice(2, 10),
        kind: "scripture",
        manual: true,
        lines: [],
        linesByVersion: {},
        importIndex: nextIdx,
      };
      updateSet(setId, { slides: [...existing, slide], ...(versions ? { versions } : {}) });
      return;
    }
    setManualText((prev) => joinBlocks(prev, scriptureHeader("", true)));
    if (boxVersions[1]) setManualText2((prev) => joinBlocks(prev, scriptureHeader("", true)));
    if (versions) updateSet(setId, { versions });
  };

  const clearBoxes = () => {
    setManualText("");
    setManualText2("");
    setAlignNote(null);
    if (boxMode) updateSet(setId, { scriptureImports: [] });
  };

  return {
    multi,
    boxMode,
    bilingual,
    editVersions,
    primaryVersion,
    translation,
    setTranslation,
    translation2,
    setTranslation2,
    firstChoices,
    firstGroups,
    secondChoices,
    secondGroups,
    manualText,
    setManualText,
    manualText2,
    setManualText2,
    versesPer,
    setVersesPer,
    keepLineBreaks,
    setKeepLineBreaks,
    busy,
    err,
    alignNote,
    importScripture,
    swapVersions,
    addManualVerse,
    versionRefs,
    setVersionRefs,
    clearBoxes,
    versionsMismatch,
    frozen,
    storedVersions: inferred,
    workspaceVersions,
    updateGroupsFor,
    updateVersionsToWorkspace,
    duplicateToVersions,
  };
}

/** "John 3:16 NIV / CUNPS" with new codes in place of the old ones. A name
 *  that doesn't end in version codes (a custom title) is left as it is.
 *  Exported for tests. */
export function renameVersions(name: string, v1: string, v2: string): string {
  const m = /^(.*?)\s+([A-Za-z0-9]+)(?:\s*\/\s*([A-Za-z0-9]+))?\s*$/.exec(name);
  if (!m || !TRANSLATION_CODES.has(m[2]) || (m[3] && !TRANSLATION_CODES.has(m[3]))) return name;
  return `${m[1]} ${v1}${v2 ? ` / ${v2}` : ""}`;
}

/**
 * Carry the versions this workspace doesn't show through a rebuild. The boxes
 * only hold the visible versions, so slides rebuilt from them would drop the
 * hidden translation's text; copy it back from the stored slide that holds the
 * SAME verse. Verses are matched by their visible text (a longest-common-
 * subsequence over the two lists), and the unmatched verses left between two
 * matches, an edited verse say, pair up in order. A deleted verse takes its
 * hidden text with it and a new one gets none, so nothing shifts onto the
 * wrong verse. Only versions the set still records (`keep`, when given) are
 * carried: a version the pickers dropped goes for good rather than lingering
 * as dead text. `lines` (the compat field) keeps the set's primary version.
 * Exported for tests.
 */
export function mergeHiddenVersions(
  parsed: Slide[],
  current: Slide[],
  editVersions: string[],
  primaryVersion: string,
  keep?: string[],
): Slide[] {
  const shown = new Set(editVersions);
  const hidden = (v: string) => !shown.has(v) && (!keep || keep.includes(v));
  const visibleText = (s: Slide) =>
    editVersions
      .map((v) =>
        (s.linesByVersion?.[v] ?? (v === primaryVersion ? (s.lines ?? []).join("\n") : "")).trim(),
      )
      .join("\u0000");
  const pairing = pairByText(parsed.map(visibleText), current.map(visibleText));
  return parsed.map((p, i) => {
    const prev = pairing[i] >= 0 ? current[pairing[i]] : undefined;
    const hiddenLines: Record<string, string> = {};
    const hiddenRefs: Record<string, string> = {};
    if (prev?.linesByVersion) {
      for (const [v, t] of Object.entries(prev.linesByVersion)) if (hidden(v)) hiddenLines[v] = t;
    }
    if (prev?.referencesByVersion) {
      for (const [v, r] of Object.entries(prev.referencesByVersion))
        if (hidden(v)) hiddenRefs[v] = r;
    }
    if (!Object.keys(hiddenLines).length && !Object.keys(hiddenRefs).length) return p;
    const linesByVersion = { ...hiddenLines, ...(p.linesByVersion ?? {}) };
    const referencesByVersion = { ...hiddenRefs, ...(p.referencesByVersion ?? {}) };
    const primaryText = linesByVersion[primaryVersion];
    return {
      ...p,
      linesByVersion,
      referencesByVersion,
      lines: primaryText ? [primaryText] : p.lines,
      reference: referencesByVersion[primaryVersion] ?? p.reference,
    };
  });
}

/**
 * For each entry of `next`, the index of the `prev` entry it is the same verse
 * as, or -1. Identical texts are matched in order (longest common subsequence,
 * blanks never match); between two matches the leftover entries pair up by
 * position, extras on either side going unmatched. Exported for tests.
 */
export function pairByText(next: string[], prev: string[]): number[] {
  const n = next.length;
  const m = prev.length;
  // lcs[i][j]: length of the LCS of next[i..] and prev[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        next[i] && next[i] === prev[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = new Array<number>(n).fill(-1);
  let i = 0;
  let j = 0;
  // Walk the LCS; on the way, pair the skipped-over entries of each gap.
  let gapI = 0;
  let gapJ = 0;
  const closeGap = (endI: number, endJ: number) => {
    for (let k = 0; gapI + k < endI && gapJ + k < endJ; k++) out[gapI + k] = gapJ + k;
    gapI = endI + 1;
    gapJ = endJ + 1;
  };
  while (i < n && j < m) {
    if (next[i] && next[i] === prev[j]) {
      closeGap(i, j);
      out[i] = j;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  closeGap(n, m);
  return out;
}
