import { useLayoutEffect, useRef, useState } from "react";
import { useRegisterPhoneUndo } from "@/lib/phone-editor-bus";
import { usePhoneLayout } from "@/hooks/use-phone-layout";
import { PHONE_UI } from "@/lib/phone-layout";
import { useRowPick } from "@/hooks/use-row-pick";
import {
  inRun,
  insertVerseRows,
  removeVerseRows,
  setRowClip,
  versesFromClip,
  verseRowsText,
} from "@/lib/row-pick";
import { Plus, Trash2 } from "lucide-react";
import { DotsGrip } from "@/components/DragBits";
import { hideDragGhost } from "@/lib/drag-ghost";
import { RichText } from "@/components/RichText";
import { currentCaret, useUndo } from "@/hooks/use-undo";
import { plainLength, splitMarkup } from "@/lib/inline-format";
import { focusCell } from "@/lib/rich-caret";
import { type VerseRow, fromVerseRows, mergeRowsUp, toVerseRows } from "@/lib/slide-text";

// Import colours, matching the tints the live slide grid uses.
const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
const GRAB = "1.75rem"; // left handle column
const DEL = "3.5rem"; // right column: split + delete buttons

/**
 * The imported-scripture editor: one row per verse (a box per version, though
 * only one is surfaced today), grouped by import. Verses are separated by a rule
 * (never a literal "---"), each imported passage shares a colour and can be
 * dragged to reorder or deleted as a whole, boxes auto-grow (no scrollbars), the
 * arrow keys move between verses, and Cmd/Ctrl+Z undoes.
 */
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
  // Phone: the header's Undo button.
  useRegisterPhoneUndo(() => history.undo(null), true, history.canUndo);

  const editCell = (ri: number, v: string, value: string) => {
    record(`type:${cellKey(ri, v)}`);
    commit(rows.map((r, i) => (i === ri ? { ...r, text: { ...r.text, [v]: value } } : r)));
  };
  // A hand-typed group's reference, per version: one line, and never the
  // brackets that would turn it into a header of its own.
  const editRef = (first: number, count: number, v: string, value: string) => {
    const ref = value.replace(/[[\]\n\r]/g, "").replace(/^~+/, "");
    record(`ref:${first}:${v}`);
    commit(
      rows.map((r, i) =>
        i >= first && i < first + count ? { ...r, refs: { ...r.refs, [v]: ref } } : r,
      ),
    );
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
        // Both halves of a split verse are still that verse.
        ...(row.verses ? { verses: row.verses } : {}),
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

  // Pick whole verses: drag down from one into another (computer) or press and
  // hold (phone), then copy, cut, delete or paste over them (useRowPick).
  // Copied verses pasted back come in as verses, after the one being typed in.
  const phone = usePhoneLayout() === true && PHONE_UI;
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setScroller(scope.current?.closest<HTMLElement>("[data-editor-scroll]") ?? scope.current);
  }, []);
  const pick = useRowPick({
    scopeRef: scope,
    scroller,
    enabled: !readOnly,
    phone,
    copy: (run, version) => {
      const picked = rows.slice(run.from, run.to + 1);
      const text = verseRowsText(picked, version && versions.includes(version) ? version : v1);
      setRowClip({ kind: "verses", text, rows: picked });
      return text;
    },
    remove: (run) => {
      record();
      commit(removeVerseRows(rows, run.from, run.to));
    },
    paste: (text, run, after) => {
      const pasted = versesFromClip(text);
      if (!pasted || (!run && after === null)) return false;
      // Every version this editor shows gets a box, blank when the copy
      // didn't have it.
      const fitted = pasted.map((r) => ({
        ...r,
        text: Object.fromEntries(versions.map((v) => [v, r.text[v] ?? ""])),
      }));
      const base = run ? removeVerseRows(rows, run.from, run.to) : rows;
      const at = run ? run.from : (after as number) + 1;
      record();
      commit(insertVerseRows(base, at, fitted));
      return true;
    },
  });

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
      onMouseDown={pick.onMouseDown}
      className="min-h-0 flex-1 overflow-auto"
    >
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
                data-no-pick
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
                {/* One reference for the whole import, not per verse, in each
                    version's own language above its column. A hand-typed group's
                    references are typed in here too. */}
                <div className="grid" style={{ gridTemplateColumns: cols }}>
                  {versions.map((v) =>
                    group[0].manual ? (
                      <input
                        key={v}
                        type="text"
                        value={group[0].refs[v] ?? ""}
                        placeholder="Reference"
                        disabled={readOnly}
                        aria-label={`Reference (${v})`}
                        onChange={(e) => editRef(groupStart[gi], group.length, v, e.target.value)}
                        className="mono w-full min-w-0 bg-transparent px-3 pt-2 text-[10px] uppercase tracking-wider opacity-70 outline-none placeholder:opacity-40 focus:opacity-100 disabled:opacity-30"
                      />
                    ) : (
                      <div
                        key={v}
                        className="mono truncate px-3 pt-2 text-[10px] uppercase tracking-wider opacity-50"
                      >
                        {group[0].refs[v] ?? ""}
                      </div>
                    ),
                  )}
                </div>
                {group.map((row) => {
                  ri += 1;
                  const index = ri;
                  return (
                    <div
                      key={index}
                      data-pick-row={index}
                      data-picked={inRun(pick.run, index) ? "" : undefined}
                      className="border-b border-foreground/15 last:border-b-0"
                    >
                      <div
                        className="grid divide-x divide-foreground/15"
                        style={{ gridTemplateColumns: cols }}
                      >
                        {versions.map((v) => {
                          return (
                            <RichText
                              key={v}
                              cellId={cellKey(index, v)}
                              col={v}
                              colFirst={v === v1}
                              data={{ "data-verse-version": v, "data-verse-row": index }}
                              disabled={readOnly}
                              value={row.text[v] ?? ""}
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
      {pick.overlay}
    </div>
  );
}
