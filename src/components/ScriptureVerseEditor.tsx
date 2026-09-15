import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { DotsGrip, hideDragGhost } from "@/components/DragBits";
import { type VerseRow, fromVerseRows, toVerseRows } from "@/lib/slide-text";

// Import colours, matching the tints the live slide grid uses.
const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
const GRAB = "1.75rem"; // left handle column
const DEL = "2rem"; // right delete column

/**
 * The imported-scripture editor: one row per verse (a box per version, though
 * only one is surfaced today), grouped by import. Verses are separated by a rule
 * (never a literal "---"), each imported passage shares a colour and can be
 * dragged to reorder or deleted as a whole, boxes auto-grow (no scrollbars), and
 * the arrow keys move between verses.
 */
export function ScriptureVerseEditor({
  versions,
  text,
  setText,
}: {
  versions: string[];
  text: Record<string, string>;
  setText: (version: string, value: string) => void;
}) {
  const [v1] = versions;
  const rows = toVerseRows(text, versions);
  const cells = useRef(new Map<string, HTMLTextAreaElement>());
  const cellKey = (ri: number, v: string) => `${ri}:${v}`;
  const dragGroup = useRef<number | null>(null);

  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const commit = (next: VerseRow[]) => {
    const boxes = fromVerseRows(next, versions);
    for (const v of versions) setText(v, boxes[v] ?? "");
  };
  const editCell = (ri: number, v: string, value: string) =>
    commit(rows.map((r, i) => (i === ri ? { ...r, text: { ...r.text, [v]: value } } : r)));
  const moveCaret = (ri: number, v: string, dir: -1 | 1) => {
    const el = cells.current.get(cellKey(ri + dir, v));
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
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
  const commitGroups = (gs: VerseRow[][]) => commit(gs.flat());
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
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Version titles, aligned to each column with a centred divider. */}
      <div className="mono sticky top-0 z-10 flex border-b bg-background">
        <span style={{ width: GRAB }} />
        <div className="grid flex-1 divide-x" style={{ gridTemplateColumns: cols }}>
          {versions.map((v) => (
            <div key={v} className="px-3 py-1 text-[10px] uppercase tracking-wider opacity-60">
              {v === "_" ? "Verses" : v}
            </div>
          ))}
        </div>
        <span style={{ width: DEL }} />
      </div>

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
              className="flex border-b-2"
              style={{ backgroundColor: `color-mix(in oklab, ${tint} 8%, transparent)` }}
            >
              <span
                draggable
                onDragStart={(e) => {
                  dragGroup.current = gi;
                  hideDragGhost(e);
                }}
                onDragEnd={() => (dragGroup.current = null)}
                className="flex shrink-0 cursor-grab items-start justify-center pt-2"
                style={{ width: GRAB }}
                title="Drag to reorder this import"
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
                    <div key={index} className="border-b last:border-b-0">
                      <div className="grid divide-x" style={{ gridTemplateColumns: cols }}>
                        {versions.map((v) => {
                          const selected =
                            !!colSel &&
                            colSel.version === v &&
                            index >= colSel.from &&
                            index <= colSel.to;
                          return (
                            <textarea
                              key={v}
                              data-verse-version={v}
                              data-verse-row={index}
                              ref={(el) => {
                                if (el) {
                                  cells.current.set(cellKey(index, v), el);
                                  autosize(el);
                                } else cells.current.delete(cellKey(index, v));
                              }}
                              rows={1}
                              value={row.text[v] ?? ""}
                              onMouseDown={() => onCellMouseDown(v, index)}
                              onInput={(e) => autosize(e.currentTarget)}
                              onChange={(e) => editCell(index, v, e.target.value)}
                              onKeyDown={(e) => {
                                const el = e.currentTarget;
                                if (e.key === "ArrowUp" && el.selectionStart === 0) {
                                  e.preventDefault();
                                  moveCaret(index, v, -1);
                                } else if (
                                  e.key === "ArrowDown" &&
                                  el.selectionStart === el.value.length
                                ) {
                                  e.preventDefault();
                                  moveCaret(index, v, 1);
                                }
                              }}
                              style={
                                selected
                                  ? {
                                      backgroundColor:
                                        "color-mix(in oklab, var(--foreground) 18%, transparent)",
                                    }
                                  : undefined
                              }
                              className="mono w-full resize-none overflow-hidden bg-transparent px-3 py-2 text-xs outline-none"
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="flex shrink-0 items-start justify-center pt-1.5"
                style={{ width: DEL }}
              >
                <button
                  type="button"
                  aria-label="Delete this import"
                  onClick={() => commitGroups(groups.filter((_, i) => i !== gi))}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-foreground/60 transition hover:bg-foreground/15 hover:text-foreground"
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
