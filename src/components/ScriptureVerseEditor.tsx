import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DotsGrip, hideDragGhost } from "@/components/DragBits";
import { RichText } from "@/components/RichText";
import { currentCaret, useUndo } from "@/hooks/use-undo";
import { plainLength, splitMarkup } from "@/lib/inline-format";
import { focusCell } from "@/lib/rich-caret";
import { type VerseRow, fromVerseRows, toVerseRows } from "@/lib/slide-text";

// Import colours, matching the tints the live slide grid uses.
const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
const GRAB = "1.75rem"; // left handle column
const DEL = "3.5rem"; // right column: split + delete buttons (same width in the header)

/**
 * The imported-scripture editor: one row per verse (a box per version, though
 * only one is surfaced today), grouped by import. Verses are separated by a rule
 * (never a literal "---"), each imported passage shares a colour and can be
 * dragged to reorder or deleted as a whole, boxes auto-grow (no scrollbars), the
 * arrow keys move between verses, and Cmd/Ctrl+Z undoes.
 */
/** Two verses as one: a single space between them, nothing added when either
 *  side is empty. Exported for tests. */
export function joinVerse(a: string, b: string): string {
  const left = a.trimEnd();
  const right = b.trimStart();
  return left && right ? `${left} ${right}` : left || right;
}

/** Rows with verse `ri` joined onto the one above it (every version), or null
 *  when it's the first verse of its import (nothing to join onto). */
export function mergeRowsUp(rows: VerseRow[], ri: number, versions: string[]): VerseRow[] | null {
  if (ri <= 0 || ri >= rows.length || rows[ri].starts) return null;
  const prev = rows[ri - 1];
  const cur = rows[ri];
  const merged: VerseRow = {
    ...prev,
    text: Object.fromEntries(
      versions.map((v) => [v, joinVerse(prev.text[v] ?? "", cur.text[v] ?? "")]),
    ),
  };
  return rows.map((r, i) => (i === ri - 1 ? merged : r)).filter((_, i) => i !== ri);
}

export function ScriptureVerseEditor({
  versions,
  text,
  setText,
  readOnly = false,
}: {
  versions: string[];
  text: Record<string, string>;
  setText: (version: string, value: string) => void;
  /** Frozen: verses are shown greyed and can't be edited or reordered; an
   *  import can still be deleted (the way out of a version mismatch). */
  readOnly?: boolean;
}) {
  const [v1] = versions;
  const rows = toVerseRows(text, versions);
  const cellKey = (ri: number, v: string) => `${ri}:${v}`;
  const dragGroup = useRef<number | null>(null);
  const scope = useRef<HTMLDivElement | null>(null);

  const commit = (next: VerseRow[]) => {
    const boxes = fromVerseRows(next, versions);
    for (const v of versions) setText(v, boxes[v] ?? "");
  };
  // Cmd/Ctrl+Z over the boxes: text, joins, splits, formatting, reorders.
  const history = useUndo({
    value: text,
    apply: (t) => {
      for (const v of versions) setText(v, t[v] ?? "");
    },
    scope,
    equals: (a, b) => versions.every((v) => (a[v] ?? "") === (b[v] ?? "")),
  });
  const record = (key?: string) => history.record(currentCaret(scope.current), key);

  const editCell = (ri: number, v: string, value: string) => {
    record(`type:${cellKey(ri, v)}`);
    commit(rows.map((r, i) => (i === ri ? { ...r, text: { ...r.text, [v]: value } } : r)));
  };
  // Backspace at the very start of a verse joins it onto the verse above, in
  // EVERY version at once (the verses are aligned, so they merge together).
  // Only within one import: the first verse of a passage has nothing above it
  // to join, even when another passage sits before it. The caret lands at the
  // seam, where the verse was split.
  const mergeUp = (ri: number, v: string) => {
    const next = mergeRowsUp(rows, ri, versions);
    if (!next) return;
    const seam = plainLength((rows[ri - 1].text[v] ?? "").trimEnd());
    record();
    commit(next);
    focusCell(scope.current, cellKey(ri - 1, v), seam);
  };
  // Where the caret last was, so the + button can split there.
  const lastCaret = useRef<{ ri: number; v: string; at: number } | null>(null);
  const noteCaret = (ri: number, v: string, at: number) => {
    lastCaret.current = { ri, v, at };
  };
  /** Split verse `ri` at `at` in version `v`: the text after the caret goes to
   *  the verse below. In the other versions the new verse is blank, UNLESS the
   *  verse below already exists (same import) and is blank in `v`, in which
   *  case the tail fills that blank instead of opening another row. That is
   *  how the second language catches up: split the first version, then put the
   *  caret in the second and press the same shortcut. */
  const splitRow = (ri: number, v: string, at: number) => {
    const row = rows[ri];
    if (!row) return;
    const [rawHead, rawTail] = splitMarkup(row.text[v] ?? "", at);
    const head = rawHead.trimEnd();
    const tail = rawTail.trimStart();
    const below = rows[ri + 1];
    const fillBelow = !!below && !below.starts && !(below.text[v] ?? "").trim();
    let next: VerseRow[];
    if (fillBelow) {
      next = rows.map((r, i) =>
        i === ri
          ? { ...r, text: { ...r.text, [v]: head } }
          : i === ri + 1
            ? { ...r, text: { ...r.text, [v]: tail } }
            : r,
      );
    } else {
      const fresh: VerseRow = {
        refs: { ...row.refs },
        starts: false,
        text: Object.fromEntries(versions.map((ver) => [ver, ver === v ? tail : ""])),
      };
      next = [
        ...rows.slice(0, ri),
        { ...row, text: { ...row.text, [v]: head } },
        fresh,
        ...rows.slice(ri + 1),
      ];
    }
    record();
    commit(next);
    // The caret moves down to the start of the new verse.
    focusCell(scope.current, cellKey(ri + 1, v), 0);
  };

  // Drag down a version column to select a run of its verses as if it were one
  // text box. A plain click leaves in-cell editing untouched; Cmd/Ctrl+C then
  // copies the selected verses joined by newlines.
  const [colSel, setColSel] = useState<{ version: string; from: number; to: number } | null>(null);
  const dragAnchor = useRef<{ version: string; row: number } | null>(null);
  const onCellMouseDown = (version: string, rowIndex: number) => {
    setColSel(null);
    dragAnchor.current = { version, row: rowIndex };
    const onMove = (e: MouseEvent) => {
      const anchor = dragAnchor.current;
      if (!anchor) return;
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cell = under?.closest?.("[data-verse-version]") as HTMLElement | null;
      if (!cell || cell.getAttribute("data-verse-version") !== anchor.version) return;
      const r = Number(cell.getAttribute("data-verse-row"));
      if (Number.isNaN(r) || r === anchor.row) {
        setColSel(null);
        return;
      }
      window.getSelection()?.removeAllRanges();
      setColSel({
        version: anchor.version,
        from: Math.min(anchor.row, r),
        to: Math.max(anchor.row, r),
      });
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
      const t = rows
        .filter((_, i) => i >= colSel.from && i <= colSel.to)
        .map((r) => r.text[colSel.version] ?? "")
        .join("\n");
      e.clipboardData?.setData("text/plain", t);
      e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [colSel, rows]);

  // One group per import: a verse that begins an import (row.starts) opens a new
  // group, so importing the same passage twice shows as two groups rather than
  // merging by their shared reference.
  const groups: VerseRow[][] = [];
  for (const r of rows) {
    if (r.starts || groups.length === 0) groups.push([r]);
    else groups[groups.length - 1].push(r);
  }
  const cols = `repeat(${versions.length}, minmax(0, 1fr))`;
  // The running verse index each group starts at.
  const groupStart: number[] = [];
  {
    let n = 0;
    for (const g of groups) {
      groupStart.push(n);
      n += g.length;
    }
  }
  const commitGroups = (gs: VerseRow[][]) => {
    record();
    commit(gs.flat());
  };
  const moveGroup = (to: number) => {
    const from = dragGroup.current;
    if (from === null || from === to) return;
    const next = [...groups];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    dragGroup.current = to;
    commitGroups(next);
  };

  let ri = -1; // running verse index across groups, for refs + arrow keys

  return (
    <div
      ref={scope}
      data-rich-cells
      onKeyDown={(e) => {
        if (readOnly) return;
        history.onKeyDown(e, () => currentCaret(scope.current));
      }}
      className="min-h-0 flex-1 overflow-auto"
    >
      {/* Version titles, aligned to each column with a centred divider. Hidden
          while the only "version" is the unnamed placeholder — there are no real
          Bible versions to label yet, so the lone "Verses" header is just noise.
          It reappears automatically once named versions exist. */}
      {!(versions.length === 1 && versions[0] === "_") && (
        <div className="mono sticky top-0 z-10 flex border-b bg-background">
          <span style={{ width: GRAB }} />
          <div className="grid flex-1 divide-x" style={{ gridTemplateColumns: cols }}>
            {versions.map((v) => (
              <div key={v} className="px-3 py-1 text-[10px] uppercase tracking-wider opacity-60">
                {v}
              </div>
            ))}
          </div>
          <span style={{ width: DEL }} />
        </div>
      )}

      {groups.length === 0 ? (
        <p className="mono px-5 py-6 text-center text-xs uppercase tracking-wider opacity-50">
          Import a passage above to begin.
        </p>
      ) : (
        groups.map((group, gi) => {
          const tint = TINTS[gi % TINTS.length];
          return (
            <div
              key={gi}
              onDragOver={(e) => {
                if (dragGroup.current === null) return;
                e.preventDefault();
                moveGroup(gi);
              }}
              className="flex border-b border-foreground/15"
              style={{ backgroundColor: `color-mix(in oklab, ${tint} 30%, transparent)` }}
            >
              <span
                draggable={!readOnly}
                onDragStart={(e) => {
                  if (readOnly) return;
                  dragGroup.current = gi;
                  hideDragGhost(e);
                }}
                onDragEnd={() => (dragGroup.current = null)}
                className={`flex shrink-0 items-start justify-center pt-2 ${readOnly ? "opacity-30" : "cursor-grab"}`}
                style={{ width: GRAB }}
                title={readOnly ? undefined : "Drag to reorder this import"}
              >
                <DotsGrip className="opacity-40" size={12} />
              </span>

              <div className="min-w-0 flex-1">
                {/* One reference for the whole import, not per verse. */}
                <div className="mono px-3 pt-2 text-[10px] uppercase tracking-wider opacity-50">
                  {group[0].refs[v1] ?? ""}
                </div>
                {group.map((row) => {
                  ri += 1;
                  const index = ri;
                  return (
                    <div key={index} className="border-b border-foreground/15 last:border-b-0">
                      <div
                        className="grid divide-x divide-foreground/15"
                        style={{ gridTemplateColumns: cols }}
                      >
                        {versions.map((v) => {
                          const selected =
                            !!colSel &&
                            colSel.version === v &&
                            index >= colSel.from &&
                            index <= colSel.to;
                          return (
                            <RichText
                              key={v}
                              cellId={cellKey(index, v)}
                              col={v}
                              colFirst={v === v1}
                              data={{ "data-verse-version": v, "data-verse-row": index }}
                              disabled={readOnly}
                              value={row.text[v] ?? ""}
                              onMouseDown={() => onCellMouseDown(v, index)}
                              onChange={(val) => editCell(index, v, val)}
                              onFocus={(at) => noteCaret(index, v, at)}
                              onCaret={(at) => noteCaret(index, v, at)}
                              onKeyDown={({ e, at, collapsed }) => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault();
                                  if (!readOnly) splitRow(index, v, at);
                                  return true;
                                }
                                if (e.key === "Backspace" && collapsed && at === 0) {
                                  e.preventDefault();
                                  mergeUp(index, v);
                                  return true;
                                }
                              }}
                              selected={selected}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Split at the caret (the last place you clicked or typed in
                  this passage) and delete, side by side. With no caret in the
                  passage, + adds a blank verse at its end. */}
              <div className="flex shrink-0 items-start justify-end pt-1.5" style={{ width: DEL }}>
                {!readOnly && (
                  <button
                    type="button"
                    aria-label="Split the verse at the cursor"
                    title="Split the verse at the cursor (Cmd/Ctrl+Enter)"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const first = groupStart[gi];
                      const last = first + groups[gi].length - 1;
                      const c = lastCaret.current;
                      if (c && c.ri >= first && c.ri <= last) splitRow(c.ri, c.v, c.at);
                      else splitRow(last, v1, plainLength(rows[last]?.text[v1] ?? ""));
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-foreground/60 transition hover:bg-foreground/15 hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Delete this import"
                  onClick={() => commitGroups(groups.filter((_, i) => i !== gi))}
                  className="mr-1 flex h-6 w-6 items-center justify-center rounded-full text-foreground/60 transition hover:bg-foreground/15 hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
