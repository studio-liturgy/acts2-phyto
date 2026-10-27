import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PHONE_DOCK_ICON, keepFocus, scrollEditorToEnd } from "@/lib/phone-dock";
import { SeparatorHorizontal, StretchHorizontal } from "lucide-react";
import { touchReorder } from "@/lib/touch-reorder";
import { dragRowTarget } from "@/lib/phone-layout";
import { useRegisterPhoneUndo } from "@/lib/phone-editor-bus";
import { createPortal } from "react-dom";
import { EditorBar } from "@/components/EditorBar";
import { Plus, Trash2, X } from "lucide-react";
import { LangPickerMenu } from "@/components/LangSearch";
import { DotsGrip } from "@/components/DragBits";
import { hideDragGhost } from "@/lib/drag-ghost";
import { LANGS, type LangCode, type LangDef, langColor, langDef, langFontStack } from "@/lib/langs";
import {
  reapplyChords,
  setChordAt,
  splitChordLine,
  stripChordsRaw,
  type SongChords,
} from "@/lib/chords";
import { useGridChordBus, wordStartAt } from "@/lib/grid-chord-bus";
import { ChordStrip } from "@/components/ChordStrip";
import {
  type MultiRow,
  addSectionRow,
  langLinesPer,
  slideStarts,
  divideRows,
  clearColumnRange,
  columnRangeText,
  pasteDownColumn,
  joinColumnCell,
  splitColumnCell,
  rowsToSlides,
  shownLangs,
  slidesToRows,
  splitPasteBlock,
} from "@/lib/multiling";
import { reconcileSlideIds } from "@/lib/slide-text";
import { newSectionName } from "@/lib/sections";
import { useLibrary } from "@/lib/store";

const GUTTER = "2.75rem";
// Section colours, matching the tints the live slide grid uses.
const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];

/**
 * The Multilanguage song editor (ported from watch, without its machine
 * translation or proofreading): an aligned grid, one row per line across every
 * language, so line N is slide N everywhere and the columns can never drift.
 *
 * Each cell auto-grows to its content (no scrollbars). Full-width section rows
 * are coloured, carry a drag handle, and can be dropped between any two lines
 * with a live preview. A left gutter numbers each line with its slide number,
 * and the arrow keys move the caret between lines. Past four languages the
 * columns scroll horizontally; removing a column keeps its words.
 */
export function MultiLangLyricEditor({
  setId,
  toolbarSlot,
  langAddSlot,
  visibleLangs,
}: {
  setId: string;
  /** The columns the grid shows (the phone layout shows two at a time). Every
   *  edit still works on the whole song. Absent = every column. */
  visibleLangs?: LangCode[];
  /** Phone: where + (add a language) goes, left of the language chips. */
  langAddSlot?: HTMLElement | null;
  /** Where the language pills and + Section go (the Lines per slide row). */
  toolbarSlot?: HTMLElement | null;
}) {
  const phytoSet = useLibrary((s) => s.sets[setId]);
  const updateSet = useLibrary((s) => s.updateSet);

  const langs = useMemo(() => phytoSet?.langs ?? [], [phytoSet?.langs]);
  const visibleKey = visibleLangs?.join("|") ?? "";
  const cols = useMemo(
    () => (visibleKey ? langs.filter((c) => visibleKey.split("|").includes(c)) : langs),
    [langs, visibleKey],
  );
  const langsShown = phytoSet?.langsShown;
  const perSlide = phytoSet ? langLinesPer(phytoSet) : 1;
  // Breaks placed by hand stay put; otherwise Lines per slide keeps the grid
  // evenly divided as it's edited (see the effect below).
  const customBreaks = !!phytoSet?.customBreaks;
  // Every edit goes through `setRows`, which re-divides evenly unless the
  // breaks are custom. Marking custom switches that off at once, so the break
  // being placed in the same handler survives.
  const normalize = useRef<(rs: MultiRow[]) => MultiRow[]>((rs) => rs);
  normalize.current = customBreaks ? (rs) => rs : (rs) => divideRows(rs, perSlide);
  const markCustom = () => {
    normalize.current = (rs) => rs;
    if (!useLibrary.getState().sets[setId]?.customBreaks) updateSet(setId, { customBreaks: true });
  };
  // Chords live in the cells' words as (G), but a cell only ever shows the
  // words: with chords on, the first column gets a small chord line above
  // each cell; with chords off they're hidden entirely.
  const chordCfg = phytoSet?.chords;
  const chordsOn = !!chordCfg && !chordCfg.hidden;
  const chordsOnRef = useRef(chordsOn);
  chordsOnRef.current = chordsOn;
  const [rows, setRowsRaw] = useState<MultiRow[]>(() => {
    const initial = slidesToRows(phytoSet?.slides ?? []);
    if (!initial.length) return [{ kind: "line", byLang: {} }];
    return phytoSet?.customBreaks ? initial : divideRows(initial, perSlide);
  });
  const setRows = useCallback(
    (u: MultiRow[] | ((rs: MultiRow[]) => MultiRow[])) =>
      setRowsRaw((prev) => normalize.current(typeof u === "function" ? u(prev) : u)),
    [],
  );

  // Undo / redo (Cmd+Z, Cmd+Shift+Z). The cells are controlled, so the browser's
  // own undo can't follow them; this keeps snapshots of the rows instead. Typing
  // in quick succession is one step; a structural edit (new line, column move,
  // paste, fill) is always its own step.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const history = useRef({
    past: [] as MultiRow[][],
    future: [] as MultiRow[][],
    prev: rows,
    lastAt: 0,
    discrete: false,
    restoring: false,
  });
  const step = () => (history.current.discrete = true);
  useEffect(() => {
    const h = history.current;
    if (h.prev === rows) return;
    if (h.restoring) {
      h.restoring = false;
    } else {
      const now = Date.now();
      if (h.discrete || now - h.lastAt > 700) h.past.push(h.prev);
      if (h.past.length > 200) h.past.shift();
      h.future = [];
      h.lastAt = h.discrete ? 0 : now;
      h.discrete = false;
    }
    h.prev = rows;
  }, [rows]);
  const undoRedo = (redo: boolean) => {
    const h = history.current;
    const target = (redo ? h.future : h.past).pop();
    if (!target) return;
    (redo ? h.past : h.future).push(rowsRef.current);
    h.restoring = true;
    h.lastAt = 0;
    setRowsRaw(target);
  };
  // Phone: the header's Undo button (two languages at a time on screen).
  useRegisterPhoneUndo(() => undoRedo(false), !!visibleLangs);

  // Re-focus after a row is inserted/removed. Set during the edit, consumed once.
  // By line number (the nth line row), not row index: re-dividing adds and
  // removes break rows, which shifts row indexes but never line numbers.
  const pendingFocus = useRef<{ line: number; lang: LangCode; caret?: number } | null>(null);
  const lineNo = (rs: MultiRow[], row: number) =>
    rs.slice(0, row).filter((r) => r.kind === "line").length;
  const cells = useRef(new Map<string, HTMLTextAreaElement>());
  const key = (row: number, lang: LangCode) => `${row}:${lang}`;
  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    pendingFocus.current = null;
    let seen = -1;
    const row = rows.findIndex((r) => r.kind === "line" && ++seen === want.line);
    if (row < 0) return;
    const el = cells.current.get(key(row, want.lang));
    el?.focus();
    const caret = want.caret ?? el?.value.length ?? 0;
    el?.setSelectionRange(caret, caret);
  }, [rows]);

  // Lines per slide changed (or C was cleared): re-divide the whole grid.
  const lastDivision = useRef({ perSlide, customBreaks });
  useEffect(() => {
    const was = lastDivision.current;
    lastDivision.current = { perSlide, customBreaks };
    if (customBreaks || (was.perSlide === perSlide && !was.customBreaks)) return;
    history.current.discrete = true;
    setRowsRaw((rs) => divideRows(rs, perSlide));
  }, [perSlide, customBreaks]);

  useEffect(() => {
    const parsed = rowsToSlides(rows, shownLangs(langs, langsShown));
    const current = useLibrary.getState().sets[setId]?.slides ?? [];
    const { slides, changed } = reconcileSlideIds(parsed, current);
    if (changed) updateSet(setId, { slides });
  }, [rows, langs, langsShown, setId, updateSet]);

  // Column widths follow the text. At four languages or fewer the columns share
  // the container: each is weighted by the width of its longest line, so a
  // fuller column grows and the rest give way proportionally, never scrolling.
  // At five or more, every column is at least an equal share of the container
  // (so the columns together are never narrower than it) and grows past that to
  // fit its own text, which is the point the grid begins to scroll. Widths are
  // measured on a canvas rather than from the DOM so a keystroke doesn't reflow.
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureCanvas = useRef<HTMLCanvasElement | null>(null);
  const [gridCols, setGridCols] = useState(
    `${GUTTER} repeat(${langs.length || 1}, minmax(0, 1fr))`,
  );
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || cols.length === 0) return;
    const GUTTER_PX = 44; // 2.75rem
    const PAD = 18; // cell padding + caret room
    const measure = () => {
      const canvas = (measureCanvas.current ??= document.createElement("canvas"));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const contents = cols.map((code) => {
        ctx.font = `14px ${langFontStack(code) || "system-ui, -apple-system, sans-serif"}`;
        let max = 0;
        for (const r of rows) {
          if (r.kind !== "line") continue;
          const t = r.byLang[code];
          if (t) max = Math.max(max, ctx.measureText(stripChordsRaw(t)).width);
        }
        return Math.max(max + PAD, 24); // a floor so an empty column isn't 0-wide
      });
      const n = cols.length;
      const available = Math.max(1, el.clientWidth - GUTTER_PX);
      const sum = contents.reduce((a, b) => a + b, 0);

      if (visibleKey) {
        // Phone (two at a time): an even split, so the second column always
        // shows; a long line scrolls inside its own cell.
        setGridCols(`${GUTTER} repeat(${n}, minmax(0, 1fr))`);
      } else if (n <= 4) {
        // Fill the container exactly, no scroll. A column never gets less than
        // its own text needs; any leftover raises the SHORTER columns up to a
        // shared level (water-filling), so a long English column keeps just its
        // text width (no trailing gap) while the short/empty columns share the
        // rest evenly (never squished). If everything together overflows, shrink
        // all in proportion.
        let cols: number[];
        if (sum >= available) {
          cols = contents.map((c) => (c * available) / sum);
        } else {
          // Find the level L where sum(max(content, L)) === available: peel off
          // the columns already taller than the level, split the rest at L.
          let fixed = 0;
          let free = n;
          for (const c of [...contents].sort((a, b) => b - a)) {
            const level = (available - fixed) / free;
            if (c > level && free > 1) {
              fixed += c;
              free -= 1;
            } else break;
          }
          const L = (available - fixed) / free;
          cols = contents.map((c) => Math.max(c, L));
        }
        setGridCols(`${GUTTER} ${cols.map((w) => `${w.toFixed(1)}px`).join(" ")}`);
      } else {
        // Five or more: each column is at least an equal share of the container,
        // so together they never fall short of it; a column grows past that to
        // fit its text, which is when the grid scrolls.
        const minPer = available / n;
        setGridCols(
          `${GUTTER} ${contents.map((w) => `${Math.max(w, minPer).toFixed(1)}px`).join(" ")}`,
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, cols, visibleKey]);

  // Drag down a column to select a run of its cells as if it were one text box:
  // the drag ignores section rows and every other language. A plain click (no
  // cross-cell move) leaves normal in-cell editing untouched; Cmd/Ctrl+C then
  // copies the selected lines joined by newlines.
  const [colSel, setColSel] = useState<{ lang: LangCode; from: number; to: number } | null>(null);
  const dragAnchor = useRef<{ lang: LangCode; row: number } | null>(null);
  const onCellMouseDown = (lang: LangCode, rowIndex: number) => {
    setColSel(null);
    dragAnchor.current = { lang, row: rowIndex };
    const onMove = (e: MouseEvent) => {
      const anchor = dragAnchor.current;
      if (!anchor) return;
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cell = under?.closest?.("[data-cell-lang]") as HTMLElement | null;
      if (!cell || cell.getAttribute("data-cell-lang") !== anchor.lang) return;
      const r = Number(cell.getAttribute("data-cell-row"));
      if (Number.isNaN(r) || r === anchor.row) {
        setColSel(null);
        return;
      }
      // Crossed into another cell of the same column: take over as a column
      // selection and drop the native (single-cell) text selection.
      window.getSelection()?.removeAllRanges();
      setColSel({ lang: anchor.lang, from: Math.min(anchor.row, r), to: Math.max(anchor.row, r) });
    };
    const onUp = () => {
      dragAnchor.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  useEffect(() => {
    if (!colSel) return;
    const onCopy = (e: ClipboardEvent) => {
      // Chords off: the (G) chords stay out of the copy.
      const text = columnRangeText(rows, colSel.lang, colSel.from, colSel.to, chordsOn);
      e.clipboardData?.setData("text/plain", text);
      e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [colSel, rows, chordsOn]);

  // Cut / delete / paste on a column selection. Deleting empties the cells of
  // rows that still have words in another language and removes rows left with
  // none; pasting replaces the selection and runs on down the column.
  useEffect(() => {
    if (!colSel) return;
    const { lang, from, to } = colSel;
    const onCut = (e: ClipboardEvent) => {
      e.clipboardData?.setData(
        "text/plain",
        columnRangeText(rowsRef.current, lang, from, to, chordsOnRef.current),
      );
      e.preventDefault();
      step();
      setRows((rs) => clearColumnRange(rs, lang, from, to));
      setColSel(null);
    };
    const onPaste = (e: ClipboardEvent) => {
      const incoming = splitPasteBlock(e.clipboardData?.getData("text") ?? "");
      e.preventDefault();
      e.stopPropagation();
      step();
      setRows((rs) => {
        let next: MultiRow[] = rs.map((r, i) => {
          if (r.kind !== "line" || i < from || i > to) return r;
          const byLang = { ...r.byLang };
          delete byLang[lang];
          return { ...r, byLang };
        });
        let cursor = from;
        for (const text of incoming) {
          while (cursor < next.length && next[cursor].kind !== "line") cursor++;
          if (cursor >= next.length) next = [...next, { kind: "line", byLang: {} }];
          const target = next[cursor];
          if (target.kind === "line") {
            next[cursor] = { ...target, byLang: { ...target.byLang, [lang]: text } };
          }
          cursor++;
        }
        // Selected rows the paste didn't reach, now empty everywhere, go.
        return next.filter(
          (r, i) =>
            !(
              i >= cursor &&
              i <= to &&
              r.kind === "line" &&
              Object.values(r.byLang).every((v) => !v?.trim())
            ),
        );
      });
      setColSel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        step();
        setRows((rs) => clearColumnRange(rs, lang, from, to));
        setColSel(null);
      } else if (e.key === "Escape") {
        setColSel(null);
      } else if (!e.metaKey && !e.ctrlKey && e.key.length === 1) {
        // Typing goes back to the cell under the caret.
        setColSel(null);
      }
    };
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [setRows, colSel]);

  // Cmd+Z / Cmd+Shift+Z (or Cmd+Y) anywhere in the editor.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      const active = document.activeElement;
      if (active && active !== document.body && !rootRef.current?.contains(active)) return;
      e.preventDefault();
      undoRedo(k === "y" || e.shiftKey);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A removed column leaves the presenter's shown languages too.
  const setLangs = (next: LangCode[]) =>
    updateSet(setId, {
      langs: next,
      ...(langsShown ? { langsShown: langsShown.filter((l) => next.includes(l)) } : {}),
    });

  // The cell shows the words only; its chords are put back around the edit.
  const editCell = (row: number, lang: LangCode, value: string) =>
    setRows((rs) =>
      rs.map((r, i) =>
        i === row && r.kind === "line"
          ? { ...r, byLang: { ...r.byLang, [lang]: reapplyChords(r.byLang[lang] ?? "", value) } }
          : r,
      ),
    );
  // The chord palette (above the grid) drops its chord at the caret of the
  // last focused cell, on that row's first-column words (where chords live).
  const lastCaret = useRef<{ row: number; caret: number } | null>(null);
  const stripEdit = useRef<{ row: number; index: number } | null>(null);
  const [stripClose, setStripClose] = useState(0);
  const chordAction = useGridChordBus((s) => s.action);
  const seenAction = useRef(chordAction?.seq ?? 0);
  useEffect(() => {
    if (!chordAction || chordAction.seq === seenAction.current) return;
    seenAction.current = chordAction.seq;
    const lang = langs[0];
    if (!lang) return;
    // A chord box open above a word takes the palette's chord.
    const strip = stripEdit.current;
    if (strip) {
      stripEdit.current = null;
      setStripClose((n) => n + 1);
      step();
      setRows((rs) =>
        rs.map((r, i) => {
          if (i !== strip.row || r.kind !== "line") return r;
          const line = r.byLang[lang] ?? "";
          const next =
            chordAction.kind === "clear"
              ? stripChordsRaw(line)
              : setChordAt(line, strip.index, chordAction.chord);
          return { ...r, byLang: { ...r.byLang, [lang]: next } };
        }),
      );
      return;
    }
    const at = lastCaret.current;
    if (!at) return;
    step();
    setRows((rs) =>
      rs.map((r, i) => {
        if (i !== at.row || r.kind !== "line") return r;
        const line = r.byLang[lang] ?? "";
        const next =
          chordAction.kind === "clear"
            ? stripChordsRaw(line)
            : setChordAt(line, wordStartAt(stripChordsRaw(line), at.caret), chordAction.chord);
        return { ...r, byLang: { ...r.byLang, [lang]: next } };
      }),
    );
  }, [setRows, chordAction, langs]);

  // The chord line above a first-column cell: set the whole stored line.
  const setCellLine = (row: number, lang: LangCode, line: string) => {
    step();
    setRows((rs) =>
      rs.map((r, i) =>
        i === row && r.kind === "line" ? { ...r, byLang: { ...r.byLang, [lang]: line } } : r,
      ),
    );
  };
  const insertLineAfter = (row: number, lang: LangCode) => {
    step();
    setRows((rs) => [...rs.slice(0, row + 1), { kind: "line", byLang: {} }, ...rs.slice(row + 1)]);
    pendingFocus.current = { line: lineNo(rows, row) + 1, lang };
  };
  // Enter: this language's words after the cursor go onto its next line and
  // every later line of it moves down one; the other languages stay put.
  const splitCell = (row: number, lang: LangCode, caret: number) => {
    step();
    setRows((rs) => splitColumnCell(rs, row, lang, caret));
    pendingFocus.current = { line: lineNo(rows, row) + 1, lang, caret: 0 };
  };
  // Backspace at the start of a line: it joins the end of this language's line
  // above and every later line of it moves up one.
  const joinCell = (row: number, lang: LangCode) => {
    const joined = joinColumnCell(rows, row, lang);
    if (!joined) return false;
    step();
    setRows(joined.rows);
    pendingFocus.current = { line: lineNo(rows, joined.row), lang, caret: joined.caret };
    return true;
  };
  const removeRow = (row: number, lang?: LangCode) => {
    step();
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((_, i) => i !== row)));
    if (lang) pendingFocus.current = { line: Math.max(0, lineNo(rows, row) - 1), lang };
  };
  const editSection = (row: number, text: string) =>
    setRows((rs) => rs.map((r, i) => (i === row && r.kind === "section" ? { ...r, text } : r)));

  // A section drops in above the line the cursor is on.
  const focusRowRef = useRef<number | null>(null);
  const focusLangRef = useRef<LangCode | null>(null);
  const addSection = () => {
    const name = newSectionName(rows.flatMap((r) => (r.kind === "section" ? [r.text] : [])));
    const { rows: next, line } = addSectionRow(rows, focusRowRef.current, name);
    step();
    const lang =
      focusLangRef.current && langs.includes(focusLangRef.current)
        ? focusLangRef.current
        : langs[0];
    if (lang) pendingFocus.current = { line, lang, caret: 0 };
    setRows(next);
  };

  const pasteDown = (row: number, lang: LangCode, text: string) => {
    const incoming = splitPasteBlock(text);
    if (incoming.length <= 1) return false;
    step();
    setRows((rs) => pasteDownColumn(rs, row, lang, incoming));
    return true;
  };

  // Cmd+Enter: a slide break after this line (by hand, so the stepper reads
  // C), the caret onto the next line, which is made if there isn't one.
  const breakAfter = (row: number, lang: LangCode, caret: number) => {
    step();
    const cur = rows[row];
    const raw = cur?.kind === "line" ? (cur.byLang[lang] ?? "") : "";
    const shown = stripChordsRaw(raw);
    if (caret > 0 && caret < shown.length) {
      // Mid-line: this language's words after the cursor go onto a new
      // slide (chords stay with their words), the cursor at their start. If
      // the next line's cell in this language is empty they drop into it, as
      // in scripture's second version; otherwise a new line is made.
      const [left, right] = splitChordLine(raw, caret);
      const hasBreak = rows[row + 1]?.kind === "break";
      if (!hasBreak) markCustom();
      pendingFocus.current = { line: lineNo(rows, row) + 1, lang, caret: 0 };
      setRows((rs) => {
        const next = [...rs];
        const r = next[row];
        if (r?.kind !== "line") return rs;
        next[row] = { ...r, byLang: { ...r.byLang, [lang]: left.trimEnd() } };
        if (next[row + 1]?.kind !== "break") next.splice(row + 1, 0, { kind: "break" });
        const below = next[row + 2];
        const tail = right.trimStart();
        if (below?.kind === "line" && !below.byLang[lang]?.trim()) {
          next[row + 2] = { ...below, byLang: { ...below.byLang, [lang]: tail } };
        } else {
          next.splice(row + 2, 0, { kind: "line", byLang: { [lang]: tail } });
        }
        return next;
      });
      return;
    }
    // Already the end of a slide: just go to the next line.
    if (rows[row + 1]?.kind !== "break") markCustom();
    pendingFocus.current = { line: lineNo(rows, row) + 1, lang };
    setRows((rs) => {
      const next = [...rs];
      if (next[row + 1]?.kind !== "break") next.splice(row + 1, 0, { kind: "break" });
      if (next[row + 2]?.kind !== "line") next.splice(row + 2, 0, { kind: "line", byLang: {} });
      return next;
    });
  };

  // Backspace at the start of a line just under a slide break: the break goes.
  const removeBreakAbove = (row: number, lang: LangCode) => {
    step();
    markCustom();
    pendingFocus.current = { line: lineNo(rows, row), lang, caret: 0 };
    setRows((rs) => rs.filter((_, i) => i !== row - 1));
  };

  // Arrow keys move the caret between the same column's line cells.
  const moveCaret = (row: number, lang: LangCode, dir: -1 | 1) => {
    for (let i = row + dir; i >= 0 && i < rows.length; i += dir) {
      if (rows[i].kind === "line") {
        const el = cells.current.get(key(i, lang));
        el?.focus();
        el?.setSelectionRange(el.value.length, el.value.length);
        break;
      }
    }
  };

  const available = LANGS.filter((l) => !langs.includes(l.code));
  const dragLang = useRef<number | null>(null);
  const dragSecRow = useRef<number | null>(null);

  // Live-reorder a dragged section row to sit before row `i` (the preview).
  const dragSectionOver = (i: number) => {
    const cur = dragSecRow.current;
    if (cur === null || cur === i) return;
    setRows((rs) => {
      const n = [...rs];
      const [m] = n.splice(cur, 1);
      n.splice(i, 0, m);
      return n;
    });
    dragSecRow.current = i;
  };
  // Touch: by the row's middle, so a thin break or heading doesn't flick
  // between two places (dragRowTarget).
  const touchSectionOver = (over: number, row: HTMLElement, y: number) => {
    const cur = dragSecRow.current;
    if (cur === null) return;
    const r = row.getBoundingClientRect();
    const to = dragRowTarget(cur, over, y, r.top, r.height);
    if (to !== null) dragSectionOver(to);
  };

  if (langs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <LangPicker available={LANGS} onAdd={(c) => setLangs([c])} label="Language" />
      </div>
    );
  }

  const starts = slideStarts(rows);
  // Split above a line: a slide break there (by hand, so the stepper reads C).
  const splitAbove = (i: number) => {
    step();
    markCustom();
    setRows((rs) => [...rs.slice(0, i), { kind: "break" }, ...rs.slice(i)]);
  };
  let sectionNo = -1;
  let tint = "transparent";

  const sectionButton = (
    <button
      type="button"
      onClick={addSection}
      className="mono flex h-7 shrink-0 items-center gap-1 rounded-full border border-dashed px-3 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
      title="Add a section above the line your cursor is on"
    >
      <Plus className="h-3 w-3" />
      Section
    </button>
  );
  // Phone: + Section alone in the toolbar; + (a language) opens beside the
  // language chips, which live in their own scrolling row.
  const addLineAtEnd = () => {
    pendingFocus.current = { line: lineNo(rows, rows.length), lang: langs[0] };
    setRows((rs) => [...rs, { kind: "line", byLang: {} }]);
  };
  // Phone: the dock's icons. + Line, Slide break (above the line you're on),
  // Section (above the line you're on).
  const phoneToolbar = (
    <>
      <button
        type="button"
        onClick={() => {
          // Under the line being typed in; at the end when none is.
          const at = focusRowRef.current;
          if (at !== null && rows[at]?.kind === "line") {
            insertLineAfter(at, focusLangRef.current ?? langs[0]);
            focusRowRef.current = at + 1;
          } else {
            addLineAtEnd();
            scrollEditorToEnd();
          }
        }}
        onMouseDown={keepFocus}
        className={PHONE_DOCK_ICON}
        title="Add a line"
        aria-label="Add a line"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          const at = focusRowRef.current ?? 0;
          if (at > 0 && rows[at - 1]?.kind !== "break") {
            // Keep the line focused (by line number, which a break doesn't change).
            pendingFocus.current = {
              line: lineNo(rows, at),
              lang: focusLangRef.current ?? langs[0],
            };
            focusRowRef.current = at + 1;
            splitAbove(at);
          }
        }}
        onMouseDown={keepFocus}
        className={PHONE_DOCK_ICON}
        title="Slide break"
        aria-label="Slide break"
      >
        <SeparatorHorizontal className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          const atEnd = focusRowRef.current === null;
          addSection();
          if (atEnd) scrollEditorToEnd();
        }}
        onMouseDown={keepFocus}
        className={PHONE_DOCK_ICON}
        title="Add a section"
        aria-label="Add a section"
      >
        <StretchHorizontal className="h-4 w-4" />
      </button>
    </>
  );
  // Phone: + opens the Languages menu: the song's languages (x removes a
  // column, keeping its words), then the search to add one.
  const phoneLangAdd = (
    <LangPickerMenu
      available={available}
      onAdd={(c) => setLangs([...langs, c])}
      current={langs.map((c) => langDef(c))}
      onRemove={(c) => setLangs(langs.filter((x) => x !== c))}
      label=""
    />
  );

  const toolbar = (
    // Column languages for THIS song, coloured and drag-reorderable.
    <div className="ml-auto flex flex-wrap items-center gap-1.5">
      {langs.map((code, i) => (
        <span
          key={code}
          draggable
          onDragStart={(e) => {
            dragLang.current = i;
            hideDragGhost(e);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            const from = dragLang.current;
            if (from === null || from === i) return;
            const next = [...langs];
            const [moved] = next.splice(from, 1);
            next.splice(i, 0, moved);
            dragLang.current = i;
            setLangs(next);
          }}
          className="mono flex h-7 cursor-grab items-center gap-1 rounded-full border px-2 text-xs uppercase tracking-wider"
          style={{
            borderColor: langColor(code),
            backgroundColor: `color-mix(in oklab, ${langColor(code)} 14%, transparent)`,
          }}
          title={`${langDef(code).label}: drag to reorder`}
        >
          <DotsGrip className="opacity-40" size={10} />
          {langDef(code).short}
          <button
            type="button"
            aria-label={`Remove ${langDef(code).label} column (keeps its words)`}
            className="ml-auto shrink-0 cursor-pointer opacity-40 hover:opacity-100"
            onClick={() => setLangs(langs.filter((c) => c !== code))}
          >
            ×
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <LangPicker
          available={available}
          onAdd={(c) => setLangs([...langs, c])}
          label="Language"
          align="right"
        />
      )}
      {sectionButton}
    </div>
  );

  return (
    <div ref={rootRef} className="flex h-full flex-col">
      {visibleLangs
        ? toolbarSlot && createPortal(phoneToolbar, toolbarSlot)
        : toolbarSlot
          ? createPortal(toolbar, toolbarSlot)
          : toolbar}
      {visibleLangs && langAddSlot && phoneLangAdd && createPortal(phoneLangAdd, langAddSlot)}

      <div ref={scrollRef} data-editor-scroll className="min-h-0 flex-1 overflow-auto border-t">
        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          <div className="sticky left-0 top-0 z-20 border-b border-r bg-background" />
          {cols.map((code) => (
            <div
              key={code}
              className="mono sticky top-0 z-10 flex min-w-0 items-center gap-1 truncate border-b bg-background px-2 py-1 text-[11px] uppercase tracking-wider"
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: langColor(code) }}
              />
              <span className="opacity-60">{langDef(code).label}</span>
            </div>
          ))}

          {rows.map((row, i) => {
            if (row.kind === "section") {
              sectionNo += 1;
              tint = TINTS[sectionNo % TINTS.length];
              return (
                <div
                  key={i}
                  data-drag-row={i}
                  onDragOver={(e) => {
                    e.preventDefault();
                    dragSectionOver(i);
                  }}
                  className="flex items-center border-b"
                  style={{
                    gridColumn: "1 / -1",
                    backgroundColor: `color-mix(in oklab, ${tint} 22%, transparent)`,
                  }}
                >
                  {/* Grip + title stick to the left, delete to the right, so both
                      stay put through a horizontal scroll whatever the language count. */}
                  <div
                    className="sticky left-0 z-[5] flex shrink-0 items-center"
                    style={{ width: `calc(${GUTTER} + 315px)` }}
                  >
                    <span
                      draggable
                      onDragStart={(e) => {
                        dragSecRow.current = i;
                        hideDragGhost(e);
                      }}
                      onDragEnd={() => (dragSecRow.current = null)}
                      {...touchReorder({
                        attr: "drag-row",
                        onStart: () => (dragSecRow.current = i),
                        onOver: touchSectionOver,
                        onEnd: () => (dragSecRow.current = null),
                      })}
                      className="flex shrink-0 cursor-grab touch-none items-center justify-start pl-2"
                      style={{ width: GUTTER }}
                      title="Drag to move this section"
                    >
                      <DotsGrip className="opacity-50" size={12} />
                    </span>
                    <input
                      value={row.text}
                      onChange={(e) => editSection(i, e.target.value)}
                      placeholder="Verse 1"
                      className="mono flex-1 bg-transparent px-2 py-1 text-xs font-semibold uppercase tracking-wider outline-none"
                    />
                  </div>
                  <div className="flex-1" />
                  <button
                    type="button"
                    aria-label="Delete section"
                    // Keeps the keyboard up (the tap doesn't take focus).
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      // A line being typed in stays focused (rows shift, its
                      // line number doesn't).
                      const el = document.activeElement;
                      const at = focusRowRef.current;
                      if (
                        el instanceof HTMLTextAreaElement &&
                        at !== null &&
                        rows[at]?.kind === "line"
                      ) {
                        pendingFocus.current = {
                          line: lineNo(rows, at),
                          lang: focusLangRef.current ?? langs[0],
                          caret: el.selectionStart,
                        };
                        if (at > i) focusRowRef.current = at - 1;
                      }
                      removeRow(i);
                    }}
                    className="sticky right-0 z-[5] mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground/60 transition hover:bg-foreground/15 hover:text-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }

            if (row.kind === "break") {
              return (
                <div
                  key={i}
                  data-drag-row={i}
                  onDragOver={(e) => {
                    e.preventDefault();
                    dragSectionOver(i);
                  }}
                  className="group relative flex h-4 items-center"
                  style={{ gridColumn: "1 / -1" }}
                  title="Slide break: drag to move"
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      dragSecRow.current = i;
                      markCustom();
                      hideDragGhost(e);
                    }}
                    onDragEnd={() => (dragSecRow.current = null)}
                    {...touchReorder({
                      attr: "drag-row",
                      onStart: () => {
                        dragSecRow.current = i;
                        markCustom();
                      },
                      onOver: touchSectionOver,
                      onEnd: () => (dragSecRow.current = null),
                    })}
                    className="sticky left-0 z-[5] flex shrink-0 cursor-grab touch-none items-center px-2"
                  >
                    <DotsGrip className="opacity-50" size={10} />
                  </span>
                  <div className="h-0.5 w-full bg-foreground/50" />
                  <button
                    type="button"
                    aria-label="Remove slide break"
                    onClick={() => {
                      markCustom();
                      removeRow(i);
                    }}
                    className="sticky right-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-foreground/60 opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            }

            const n = starts[i];
            const rowTint = tint;
            return (
              <Row
                key={i}
                index={i}
                n={n}
                // Not on the phone: a tap between lines would split by accident
                // (Slide break is in the dock there).
                onSplitAbove={
                  !visibleLangs && n === null && rows.slice(0, i).some((r) => r.kind === "line")
                    ? () => splitAbove(i)
                    : undefined
                }
                langs={cols}
                row={row}
                tint={rowTint}
                colSel={colSel}
                onCellMouseDown={onCellMouseDown}
                cellsRef={cells}
                cellKey={key}
                autosize={autosize}
                wrapOnFocus={!!visibleLangs}
                onDragOverRow={() => dragSecRow.current !== null && dragSectionOver(i)}
                dragRow={i}
                onFocusRow={() => (focusRowRef.current = i)}
                onCaret={(row, lang, caret) => {
                  focusLangRef.current = lang;
                  // Only the first column's caret maps onto its words.
                  lastCaret.current = { row, caret: lang === langs[0] ? caret : 0 };
                }}
                editCell={editCell}
                chordLang={chordsOn ? langs[0] : undefined}
                chords={chordCfg}
                setCellLine={setCellLine}
                stripClose={stripClose}
                onStripEditing={(row, at) => {
                  if (at === null) {
                    if (stripEdit.current?.row === row) stripEdit.current = null;
                  } else stripEdit.current = { row, index: at };
                }}
                insertLineAfter={insertLineAfter}
                splitCell={splitCell}
                joinCell={joinCell}
                breakAfter={breakAfter}
                breakAbove={rows[i - 1]?.kind === "break"}
                removeBreakAbove={removeBreakAbove}
                removeRow={removeRow}
                pasteDown={pasteDown}
                moveCaret={moveCaret}
              />
            );
          })}

          {/* Under the last line, inside the container (spans every column so it
              stays put whether the grid fits or scrolls). The phone's is in the dock. */}
          <button
            type="button"
            onClick={addLineAtEnd}
            style={{ gridColumn: "1 / -1" }}
            className={`mono ${visibleLangs ? "hidden" : "flex"} items-center justify-center gap-1 border-t py-2 text-xs uppercase tracking-wider opacity-50 hover:opacity-100`}
          >
            {/* Centred in view: its left edge held at the middle, then pulled back half its width. */}
            <span className="sticky left-1/2 flex -translate-x-1/2 items-center gap-1">
              <Plus className="h-3 w-3" /> Line
            </span>
          </button>
        </div>
      </div>

      <EditorBar
        hints={["Shift Enter: new line", "Cmd/Ctrl Enter: new slide", "Cmd/Ctrl Z: undo"]}
      />
    </div>
  );
}

function Row({
  index,
  n,
  onSplitAbove,
  langs,
  row,
  tint,
  colSel,
  onCellMouseDown,
  cellsRef,
  cellKey,
  autosize,
  wrapOnFocus = false,
  onDragOverRow,
  dragRow,
  onFocusRow,
  onCaret,
  editCell,
  chordLang,
  chords,
  setCellLine,
  stripClose,
  onStripEditing,
  insertLineAfter,
  splitCell,
  joinCell,
  breakAfter,
  breakAbove,
  removeBreakAbove,
  removeRow,
  pasteDown,
  moveCaret,
}: {
  index: number;
  /** The slide this row starts (null on a slide's later rows). */
  n: number | null;
  /** A later line of its slide: hovering the seam above it offers Split. */
  onSplitAbove?: () => void;
  langs: LangCode[];
  row: Extract<MultiRow, { kind: "line" }>;
  tint: string;
  colSel: { lang: LangCode; from: number; to: number } | null;
  onCellMouseDown: (lang: LangCode, rowIndex: number) => void;
  cellsRef: React.MutableRefObject<Map<string, HTMLTextAreaElement>>;
  cellKey: (row: number, lang: LangCode) => string;
  autosize: (el: HTMLTextAreaElement | null) => void;
  /** Phone: a line wraps to show all of itself while it's being typed in,
   *  and goes back to one line (scrolled to its start) when you leave it. */
  wrapOnFocus?: boolean;
  onDragOverRow: () => void;
  /** This line's row, for a touch drag passing over it. */
  dragRow: number;
  onFocusRow: () => void;
  onCaret: (row: number, lang: LangCode, caret: number) => void;
  editCell: (row: number, lang: LangCode, value: string) => void;
  /** The column that shows a chord line (chords on), if any. */
  chordLang?: LangCode;
  chords?: SongChords;
  setCellLine: (row: number, lang: LangCode, line: string) => void;
  stripClose: number;
  onStripEditing: (row: number, index: number | null) => void;
  insertLineAfter: (row: number, lang: LangCode) => void;
  splitCell: (row: number, lang: LangCode, caret: number) => void;
  joinCell: (row: number, lang: LangCode) => boolean;
  breakAfter: (row: number, lang: LangCode, caret: number) => void;
  /** The row above is a slide break. */
  breakAbove: boolean;
  removeBreakAbove: (row: number, lang: LangCode) => void;
  removeRow: (row: number, lang?: LangCode) => void;
  pasteDown: (row: number, lang: LangCode, text: string) => boolean;
  moveCaret: (row: number, lang: LangCode, dir: -1 | 1) => void;
}) {
  // The seam above a slide's later line, drawn in every cell of the row so the
  // hover runs the grid's whole width (the row wrapper is `display: contents`,
  // and hovering any piece lights them all). The label sits at the right.
  const seam = (label: boolean) =>
    onSplitAbove && (
      <button
        type="button"
        onClick={onSplitAbove}
        tabIndex={label ? 0 : -1}
        className="seam absolute -top-1.5 left-0 right-0 z-10 flex h-3 items-center"
        aria-label="Start a new slide here"
      >
        <span className="h-0 w-full border-t border-dashed border-transparent group-has-[.seam:hover]/row:border-foreground/60" />
        {label && (
          <span className="mono absolute right-2 flex items-center gap-0.5 rounded-full bg-background px-1.5 text-[9px] uppercase tracking-wider text-muted-foreground opacity-0 group-has-[.seam:hover]/row:opacity-100">
            <Plus className="h-2.5 w-2.5" /> Slide break
          </span>
        )}
      </button>
    );
  return (
    <div className="group/row contents">
      <div
        data-drag-row={dragRow}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverRow();
        }}
        className="mono sticky left-0 z-[5] flex items-start justify-start border-b border-r px-2 py-1 text-[11px] tabular-nums text-muted-foreground"
        style={{ backgroundColor: `color-mix(in oklab, ${tint} 6%, var(--background))` }}
      >
        {seam(false)}
        {n}
      </div>
      {langs.map((code, ci) => {
        const def = langDef(code);
        const selected =
          !!colSel && colSel.lang === code && index >= colSel.from && index <= colSel.to;
        return (
          // The wrapper carries the cell's coordinates for the column drag.
          // The border and tint live here, not on the text box: as a grid item
          // this fills the row's full height, so its divider always lines up with
          // the line-number column's, whatever height the text box is.
          <div
            key={code}
            data-cell-lang={code}
            data-cell-row={index}
            // Words sit on the row's bottom edge, so a cell with a chord line
            // above it lines up with its neighbours.
            className="relative flex min-w-0 flex-col justify-end border-b"
            style={{
              // When part of a column drag-selection the cell takes the
              // language's own colour so the run reads as one highlighted block.
              backgroundColor: selected
                ? `color-mix(in oklab, ${langColor(code)} 30%, transparent)`
                : `color-mix(in oklab, ${tint} 6%, transparent)`,
            }}
          >
            {seam(ci === langs.length - 1)}
            {code === chordLang && chords && (
              <ChordStrip
                line={row.byLang[code] ?? ""}
                chords={chords}
                fontFamily={langFontStack(code) || undefined}
                onChange={(line) => setCellLine(index, code, line)}
                onEditing={(at) => onStripEditing(index, at)}
                closeSeq={stripClose}
              />
            )}
            <textarea
              ref={(el) => {
                if (el) {
                  cellsRef.current.set(cellKey(index, code), el);
                  autosize(el);
                } else cellsRef.current.delete(cellKey(index, code));
              }}
              rows={1}
              wrap="off"
              dir={def.dir}
              value={stripChordsRaw(row.byLang[code] ?? "")}
              onMouseDown={() => onCellMouseDown(code, index)}
              onFocus={(e) => {
                if (wrapOnFocus)
                  fitFocused(e.currentTarget, !(code === chordLang && chords), autosize);
                onFocusRow();
              }}
              onBlur={(e) => {
                if (wrapOnFocus) unfit(e.currentTarget, autosize);
              }}
              onSelect={(e) => onCaret(index, code, e.currentTarget.selectionStart)}
              onDragOver={(e) => {
                e.preventDefault();
                onDragOverRow();
              }}
              onInput={(e) => {
                if (wrapOnFocus)
                  fitFocused(e.currentTarget, !(code === chordLang && chords), autosize);
                else autosize(e.currentTarget);
              }}
              onChange={(e) => editCell(index, code, e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (pasteDown(index, code, text)) e.preventDefault();
              }}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  // A new slide after this line (same as Call and Response).
                  e.preventDefault();
                  breakAfter(index, code, el.selectionStart);
                } else if (e.key === "Enter" && e.shiftKey) {
                  // A blank line underneath, in every language.
                  e.preventDefault();
                  insertLineAfter(index, code);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  splitCell(index, code, el.selectionStart);
                } else if (
                  e.key === "Backspace" &&
                  el.selectionStart === 0 &&
                  el.selectionEnd === 0 &&
                  breakAbove
                ) {
                  // A slide break right above goes (same as Call and Response).
                  e.preventDefault();
                  removeBreakAbove(index, code);
                } else if (
                  e.key === "Backspace" &&
                  el.selectionStart === 0 &&
                  el.selectionEnd === 0 &&
                  Object.values(row.byLang).every((v) => !v?.trim())
                ) {
                  e.preventDefault();
                  removeRow(index, code);
                } else if (
                  e.key === "Backspace" &&
                  el.selectionStart === 0 &&
                  el.selectionEnd === 0
                ) {
                  // Joins the line above in this language only.
                  if (joinCell(index, code)) e.preventDefault();
                } else if (e.key === "ArrowUp" && el.selectionStart === 0) {
                  e.preventDefault();
                  moveCaret(index, code, -1);
                } else if (e.key === "ArrowDown" && el.selectionStart === el.value.length) {
                  e.preventDefault();
                  moveCaret(index, code, 1);
                }
              }}
              placeholder=""
              style={{
                fontFamily: langFontStack(code) || undefined,
                // A line is one slide, so it never wraps; the caret scrolls the
                // cell instead. The grid track (measured from the text) sets the
                // width; the cell just fills it.
                whiteSpace: "nowrap",
                width: "100%",
                minWidth: 0,
              }}
              // block: an inline text box would sit on a baseline and leave a gap.
              className="block w-full resize-none overflow-hidden bg-transparent py-1 pl-2 pr-2 text-sm leading-relaxed outline-none"
            />
          </div>
        );
      })}
    </div>
  );
}

function LangPicker(props: {
  available: readonly LangDef[];
  onAdd: (code: LangCode) => void;
  label: string;
  align?: "left" | "right";
}) {
  return <LangPickerMenu {...props} />;
}

/**
 * Phone: the line being typed in shows all of itself. Too long for its
 * column, it widens over the next column on the page's background, up to the
 * grid's visible right edge; longer still, it wraps there (not under a chord
 * row, whose chords sit over one unwrapped line). `unfit` puts it back.
 */
function fitFocused(
  el: HTMLTextAreaElement,
  canWrap: boolean,
  autosize: (el: HTMLTextAreaElement | null) => void,
) {
  el.wrap = "off";
  el.style.width = "";
  const need = el.scrollWidth + 2;
  if (need <= el.clientWidth + 1) {
    clearFit(el);
    autosize(el);
    return;
  }
  const box = el.closest<HTMLElement>("[data-editor-scroll]");
  const avail = box
    ? box.getBoundingClientRect().right - el.getBoundingClientRect().left - 4
    : need;
  el.style.width = `${Math.max(el.clientWidth, Math.min(need, avail))}px`;
  el.style.position = "relative";
  el.style.zIndex = "20";
  el.style.background = "var(--background)";
  el.style.boxShadow = "0 0 0 1px color-mix(in oklab, var(--foreground) 25%, transparent)";
  if (need > avail && canWrap) el.wrap = "soft";
  autosize(el);
}

function clearFit(el: HTMLTextAreaElement) {
  for (const k of ["width", "position", "zIndex", "background", "boxShadow"] as const) {
    el.style[k] = "";
  }
}

function unfit(el: HTMLTextAreaElement, autosize: (el: HTMLTextAreaElement | null) => void) {
  clearFit(el);
  el.wrap = "off";
  el.scrollLeft = 0;
  autosize(el);
}
