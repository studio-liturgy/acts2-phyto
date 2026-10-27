import { useEffect, useRef, useState } from "react";
import { PHONE_DOCK_ICON, keepFocus, scrollEditorToEnd } from "@/lib/phone-dock";
import { SeparatorHorizontal, StretchHorizontal } from "lucide-react";
import { touchReorder } from "@/lib/touch-reorder";
import { dragRowSlot } from "@/lib/phone-layout";
import { createPortal } from "react-dom";
import { EditorBar } from "@/components/EditorBar";
import { Plus, Trash2, X } from "lucide-react";
import { DotsGrip } from "@/components/DragBits";
import { hideDragGhost } from "@/lib/drag-ghost";
import { ChordStrip } from "@/components/ChordStrip";
import {
  reapplyChords,
  setChordAt,
  splitChordLine,
  stripChordsRaw,
  type SongChords,
} from "@/lib/chords";
import { useGridChordBus, wordStartAt } from "@/lib/grid-chord-bus";
import {
  addSection,
  lineSelectionText,
  pasteOverLines,
  removeLyricLines,
  breakAtCaret,
  breakBefore,
  fromDoc,
  mergeIntoPrevious,
  moveLine,
  insertLines,
  neighbourLine,
  removeLine,
  responseRows,
  sectionNames,
  setLine,
  toDoc,
  type Doc,
} from "@/lib/response-grid";
import { newSectionName } from "@/lib/sections";
import { ROLE_LABEL, nextRole, type LineRoles, type Role } from "@/lib/song-roles";

const ROLE_COLOR: Record<Role, string> = {
  leader: "var(--brand-blue)",
  people: "var(--brand-orange)",
};
// Section colours, matching the slide panel's groups.
const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
const FIRST_COL = "5.5rem";

/**
 * The Call and Response editor: one row per line, the reader in the first
 * column (where the Multi-Language grid numbers its lines), colour-coded
 * Leader blue and People orange. Click the role to cycle Leader, People, none.
 *
 * Slides break where you say: hover between two lines and click Split, or
 * press Cmd+Enter (mid-line, the words after the cursor start the new slide;
 * at the end of a line, the break goes after it). A break shows as a line across the grid (x removes it). Sections are
 * full-width rows in the slide panel's colours; drag a section or a break by
 * its grip to move it. Enter splits the line at the cursor; Shift+Enter starts
 * an empty line below for the same reader.
 *
 * It edits the plain lyrics text (with its roles alongside), so it's the same
 * song the plain editor shows: switching modes changes nothing underneath.
 */
export function ResponseLyricEditor({
  lyrics,
  roles,
  chords,
  onCommit,
  toolbarSlot,
  phone = false,
  noRoles = false,
  onUndo,
  onRedo,
}: {
  lyrics: string;
  roles: LineRoles;
  /** Chords on: a small chord line above each lyric. */
  chords?: SongChords;
  /** A whole edit: the new text and roles together (one undo step each). */
  onCommit: (
    lyrics: string,
    roles: LineRoles,
    opts?: { typing?: boolean; breaks?: boolean },
  ) => void;
  /** Where + Section goes (the Lines per slide row, after Align). */
  toolbarSlot?: HTMLElement | null;
  /** Phone: + Slide break joins + Section (the seams above lines need a hover). */
  phone?: boolean;
  /** A Standard song shown as a table: no reader column. Stored roles still
   *  travel with their lines, for a switch back to Call and Response. */
  noRoles?: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const rows = responseRows(lyrics);
  const cells = useRef(new Map<number, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ index: number; caret: number } | null>(null);
  const focusIndex = useRef<number | null>(null);
  const lastCaret = useRef<{ index: number; caret: number } | null>(null);
  const stripEdit = useRef<{ index: number; at: number } | null>(null);
  const [stripClose, setStripClose] = useState(0);

  const doc = () => toDoc(lyrics, roles);
  // Dragging a section or break row: its current stored index.
  const dragFrom = useRef<number | null>(null);
  const dragIsBreak = useRef(false);
  const dragOver = (to: number) => {
    const from = dragFrom.current;
    if (from === null || from === to || from + 1 === to) return;
    commit(moveLine(doc(), from, to), undefined, true, dragIsBreak.current);
    dragFrom.current = to > from ? to - 1 : to;
  };
  // Touch: by the row's middle, so a thin break doesn't flick back and forth.
  const touchDragOver = (over: number, row: HTMLElement, y: number) => {
    const r = row.getBoundingClientRect();
    const slot = dragRowSlot(over, y, r.top, r.height);
    if (slot !== null) dragOver(slot);
  };
  // `breaks`: a slide break placed, moved or removed by hand (stepper: C).
  const commit = (
    d: Doc,
    focus?: { index: number; caret: number },
    typing = false,
    breaks = false,
  ) => {
    if (focus) pendingFocus.current = focus;
    const { lyrics: text, roles: r } = fromDoc(d);
    onCommit(text, r, { typing, breaks });
  };

  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    pendingFocus.current = null;
    const el = cells.current.get(want.index);
    if (!el) return;
    el.focus();
    const c = Math.min(want.caret, el.value.length);
    el.setSelectionRange(c, c);
  });

  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // The chord palette: into an open chord box, else at the caret's word.
  const chordAction = useGridChordBus((s) => s.action);
  const seen = useRef(chordAction?.seq ?? 0);
  useEffect(() => {
    if (!chordAction || chordAction.seq === seen.current) return;
    seen.current = chordAction.seq;
    const d = toDoc(lyrics, roles);
    const strip = stripEdit.current;
    const target = strip ? strip.index : lastCaret.current?.index;
    if (target === undefined || d.lines[target] === undefined) return;
    const line = d.lines[target];
    const next =
      chordAction.kind === "clear"
        ? stripChordsRaw(line)
        : setChordAt(
            line,
            strip ? strip.at : wordStartAt(stripChordsRaw(line), lastCaret.current?.caret ?? 0),
            chordAction.chord,
          );
    if (strip) {
      stripEdit.current = null;
      setStripClose((n) => n + 1);
    }
    commit(setLine(d, target, next));
    // commit reads the current props; the palette fires between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chordAction]);

  // Drag down the lyric column to select a run of lines as if it were one
  // text box (as in Multi-Language): sections and breaks inside the run stay
  // put. A plain click (no cross-cell move) leaves in-cell editing untouched.
  // Cmd/Ctrl+C copies the run's lines (chords left out when Chords is off),
  // Cmd/Ctrl+X or Delete removes them, Cmd/Ctrl+V pastes over them.
  const [lineSel, setLineSel] = useState<{ from: number; to: number } | null>(null);
  const dragAnchor = useRef<number | null>(null);
  const onCellMouseDown = (index: number) => {
    setLineSel(null);
    dragAnchor.current = index;
    const onMove = (e: MouseEvent) => {
      const anchor = dragAnchor.current;
      if (anchor === null) return;
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cell = under?.closest?.("[data-lyric-row]") as HTMLElement | null;
      if (!cell) return;
      const r = Number(cell.getAttribute("data-lyric-row"));
      if (Number.isNaN(r) || r === anchor) {
        setLineSel(null);
        return;
      }
      window.getSelection()?.removeAllRanges();
      setLineSel({ from: Math.min(anchor, r), to: Math.max(anchor, r) });
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
    if (!lineSel) return;
    const { from, to } = lineSel;
    const d = toDoc(lyrics, roles);
    const onCopy = (e: ClipboardEvent) => {
      e.clipboardData?.setData("text/plain", lineSelectionText(d, from, to, !!chords));
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      e.clipboardData?.setData("text/plain", lineSelectionText(d, from, to, !!chords));
      e.preventDefault();
      setLineSel(null);
      commit(removeLyricLines(d, from, to));
    };
    const onPaste = (e: ClipboardEvent) => {
      const pasted = (e.clipboardData?.getData("text") ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      e.preventDefault();
      e.stopPropagation();
      setLineSel(null);
      if (!pasted.length) return;
      const { doc: next, focus } = pasteOverLines(d, from, to, pasted);
      commit(next, { index: focus, caret: stripChordsRaw(next.lines[focus] ?? "").length });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        setLineSel(null);
        commit(removeLyricLines(d, from, to));
      } else if (e.key === "Escape") {
        setLineSel(null);
      } else if (!e.metaKey && !e.ctrlKey && e.key.length === 1) {
        // Typing goes back to the line under the caret.
        setLineSel(null);
      }
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("keydown", onKey, true);
    };
    // commit reads the current props; it's recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineSel, lyrics, roles, chords]);

  const cycleRole = (index: number) => {
    const d = doc();
    commit(setLine(d, index, d.lines[index], nextRole(d.roles[index])));
  };

  const onAddSection = () => {
    const d = doc();
    const prevRole = [...d.roles].reverse().find((r) => r) ?? null;
    const name = newSectionName(sectionNames(lyrics));
    const { doc: next, focus } = addSection(d, focusIndex.current, name, prevRole);
    commit(next, { index: focus, caret: 0 });
  };

  const addLineAtEnd = () => {
    const d = doc();
    const last = d.lines.length;
    const prevRole = [...d.roles].reverse().find((r) => r) ?? null;
    commit(insertLines(d, last, [" "], [prevRole]), { index: last, caret: 0 });
  };

  const sectionButton = (
    <button
      type="button"
      onClick={onAddSection}
      className="mono flex h-7 items-center gap-1 rounded-full border border-dashed px-3 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
      title="Add a section above the line your cursor is on"
    >
      <Plus className="h-3 w-3" />
      Section
    </button>
  );

  // Phone: the dock's icons. + Line, Slide break and Section (both above the
  // line you're on).
  const phoneButtons = phone ? (
    <>
      <button
        type="button"
        onClick={() => {
          // Under the line being typed in; at the end when none is.
          const at = focusIndex.current;
          if (at !== null) {
            const d = doc();
            commit(insertLines(d, at + 1, [" "], [d.roles[at] ?? null]), {
              index: at + 1,
              caret: 0,
            });
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
          const at = focusIndex.current ?? 0;
          if (at <= 0) return;
          const d = doc();
          const next = breakBefore(d, at);
          // The line moves down one (a break went in above): keep it focused.
          const moved = next.lines.length > d.lines.length;
          commit(next, { index: moved ? at + 1 : at, caret: 0 }, false, true);
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
          const atEnd = focusIndex.current === null;
          onAddSection();
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
  ) : null;

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <button
          type="button"
          onClick={() =>
            commit({ lines: [" "], roles: [noRoles ? null : "leader"] }, { index: 0, caret: 0 })
          }
          className="mono flex h-7 items-center gap-1 rounded-full border border-dashed px-3 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Line
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {toolbarSlot ? createPortal(phoneButtons ?? sectionButton, toolbarSlot) : sectionButton}

      <div data-editor-scroll className="catalogue-scroll min-h-0 flex-1 overflow-auto border-t">
        <div
          className="grid"
          style={{
            gridTemplateColumns: noRoles ? "minmax(0, 1fr)" : `${FIRST_COL} minmax(0, 1fr)`,
          }}
        >
          {rows.map((row) => {
            if (row.kind === "section") {
              return (
                <div
                  key={row.index}
                  data-drag-row={row.index}
                  onDragOver={(e) => {
                    e.preventDefault();
                    dragOver(row.index);
                  }}
                  className="flex items-center border-b"
                  style={{
                    gridColumn: "1 / -1",
                    backgroundColor: `color-mix(in oklab, ${TINTS[row.group % TINTS.length]} 22%, transparent)`,
                  }}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      dragFrom.current = row.index;
                      dragIsBreak.current = false;
                      hideDragGhost(e);
                    }}
                    onDragEnd={() => (dragFrom.current = null)}
                    {...touchReorder({
                      attr: "drag-row",
                      onStart: () => {
                        dragFrom.current = row.index;
                        dragIsBreak.current = false;
                      },
                      onOver: touchDragOver,
                      onEnd: () => (dragFrom.current = null),
                    })}
                    className="flex shrink-0 cursor-grab touch-none items-center pl-2"
                    title="Drag to move this section"
                  >
                    <DotsGrip className="opacity-50" size={12} />
                  </span>
                  <input
                    value={row.text}
                    onChange={(e) => {
                      const d = doc();
                      commit(setLine(d, row.index, `[${e.target.value}]`), undefined, true);
                    }}
                    onBlur={(e) => {
                      // An emptied label would stop being a section: drop it.
                      if (!e.target.value.trim()) commit(removeLine(doc(), row.index));
                    }}
                    placeholder="Verse 1"
                    className="mono flex-1 bg-transparent px-3 py-1 text-xs font-semibold uppercase tracking-wider outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Delete section"
                    // Keeps the keyboard up (the tap doesn't take focus).
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      // A line being typed in stays focused, one up if the
                      // section was above it.
                      const el = document.activeElement;
                      const at = focusIndex.current;
                      const keep =
                        el instanceof HTMLTextAreaElement && at !== null && at !== row.index
                          ? { index: at > row.index ? at - 1 : at, caret: el.selectionStart }
                          : undefined;
                      commit(removeLine(doc(), row.index), keep);
                    }}
                    className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground/60 transition hover:bg-foreground/15 hover:text-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }
            if (row.kind === "break") {
              return (
                <div
                  key={row.index}
                  data-drag-row={row.index}
                  onDragOver={(e) => {
                    e.preventDefault();
                    dragOver(row.index);
                  }}
                  className="group relative flex h-4 items-center"
                  style={{ gridColumn: "1 / -1" }}
                  title="Slide break: drag to move"
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      dragFrom.current = row.index;
                      dragIsBreak.current = true;
                      hideDragGhost(e);
                    }}
                    onDragEnd={() => (dragFrom.current = null)}
                    {...touchReorder({
                      attr: "drag-row",
                      onStart: () => {
                        dragFrom.current = row.index;
                        dragIsBreak.current = true;
                      },
                      onOver: touchDragOver,
                      onEnd: () => (dragFrom.current = null),
                    })}
                    className="flex shrink-0 cursor-grab touch-none items-center px-2"
                  >
                    <DotsGrip className="opacity-50" size={10} />
                  </span>
                  <div className="h-0.5 w-full bg-foreground/50" />
                  <button
                    type="button"
                    aria-label="Remove slide break"
                    onClick={() => commit(removeLine(doc(), row.index), undefined, false, true)}
                    className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full bg-background text-foreground/60 opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            }

            const role = noRoles ? null : (roles[row.index] ?? null);
            const tint = role ? ROLE_COLOR[role] : "transparent";
            const text = stripChordsRaw(row.text.trim() === "" ? "" : row.text);
            return (
              <Line
                key={row.index}
                index={row.index}
                first={row.first}
                onDragOverRow={() => dragOver(row.index)}
                noRoles={noRoles}
                role={role}
                tint={tint}
                text={text}
                chords={chords}
                rawLine={row.text}
                selected={!!lineSel && row.index >= lineSel.from && row.index <= lineSel.to}
                onCellMouseDown={() => onCellMouseDown(row.index)}
                stripClose={stripClose}
                cellRef={(el) => {
                  if (el) {
                    cells.current.set(row.index, el);
                    autosize(el);
                  } else cells.current.delete(row.index);
                }}
                autosize={autosize}
                onCycleRole={() => cycleRole(row.index)}
                onSplitAbove={
                  phone
                    ? undefined
                    : () => commit(breakBefore(doc(), row.index), undefined, false, true)
                }
                onFocus={() => (focusIndex.current = row.index)}
                onCaret={(caret) => (lastCaret.current = { index: row.index, caret })}
                onStripEditing={(at) => {
                  if (at === null) {
                    if (stripEdit.current?.index === row.index) stripEdit.current = null;
                  } else stripEdit.current = { index: row.index, at };
                }}
                onChordLine={(line) => commit(setLine(doc(), row.index, line))}
                onType={(value) => {
                  const d = doc();
                  commit(
                    setLine(d, row.index, reapplyChords(row.text, value) || " "),
                    undefined,
                    true,
                  );
                }}
                onKey={(e) => {
                  const el = e.currentTarget;
                  const d = doc();
                  const caret = el.selectionStart;
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    // A new slide: mid-line, the words after the cursor go with it.
                    e.preventDefault();
                    const { doc: next, focus } = breakAtCaret(d, row.index, caret, role);
                    commit(next, { index: focus, caret: 0 }, false, true);
                  } else if (e.shiftKey && e.key === "Enter") {
                    // A new empty line below, same reader.
                    e.preventDefault();
                    commit(insertLines(d, row.index + 1, [" "], [role]), {
                      index: row.index + 1,
                      caret: 0,
                    });
                  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
                    e.preventDefault();
                    if (e.shiftKey) onRedo();
                    else onUndo();
                  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
                    e.preventDefault();
                    onRedo();
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const [left, right] = splitChordLine(row.text, caret);
                    const next = insertLines(
                      setLine(d, row.index, left.trim() ? left : " "),
                      row.index + 1,
                      [right.trim() ? right : " "],
                      [role],
                    );
                    commit(next, { index: row.index + 1, caret: 0 });
                  } else if (e.key === "Backspace" && caret === 0 && el.selectionEnd === 0) {
                    // Removes a slide break right above, else joins this line
                    // onto the end of the line above.
                    const merged = mergeIntoPrevious(d, row.index, stripChordsRaw);
                    if (merged) {
                      e.preventDefault();
                      commit(
                        merged.doc,
                        { index: merged.focus, caret: merged.caret },
                        false,
                        !!merged.breakRemoved,
                      );
                    }
                  } else if (e.key === "ArrowUp" && caret === 0) {
                    const prev = neighbourLine(lyrics, row.index, -1);
                    if (prev >= 0) {
                      e.preventDefault();
                      const target = cells.current.get(prev);
                      target?.focus();
                      target?.setSelectionRange(target.value.length, target.value.length);
                    }
                  } else if (e.key === "ArrowDown" && caret === el.value.length) {
                    const next = neighbourLine(lyrics, row.index, 1);
                    if (next >= 0) {
                      e.preventDefault();
                      cells.current.get(next)?.focus();
                    }
                  }
                }}
                onPasteLines={(pasted, caret) => {
                  const d = doc();
                  const [left, right] = splitChordLine(row.text, caret);
                  const extra = pasted.slice(1);
                  const firstLine = (left + pasted[0]).trim() ? left + pasted[0] : " ";
                  let next = setLine(d, row.index, firstLine);
                  const tail = [...extra];
                  if (tail.length) tail[tail.length - 1] = tail[tail.length - 1] + right;
                  next = insertLines(
                    next,
                    row.index + 1,
                    tail,
                    tail.map(() => null),
                  );
                  commit(next, { index: row.index + tail.length, caret: 0 });
                }}
              />
            );
          })}

          <button
            type="button"
            onClick={addLineAtEnd}
            style={{ gridColumn: "1 / -1" }}
            className={`mono ${phone ? "hidden" : "flex"} items-center justify-center gap-1 border-t py-2 text-xs uppercase tracking-wider opacity-50 hover:opacity-100`}
          >
            <Plus className="h-3 w-3" /> Line
          </button>
        </div>
      </div>

      <EditorBar
        hints={[
          ...(noRoles ? [] : ["Click a role to change it"]),
          "Shift Enter: new line",
          "Cmd/Ctrl Enter: new slide",
          "Cmd/Ctrl Z: undo",
        ]}
      />
    </div>
  );
}

function Line({
  index,
  first,
  onDragOverRow,
  role,
  tint,
  text,
  rawLine,
  selected,
  onCellMouseDown,
  chords,
  stripClose,
  cellRef,
  autosize,
  onCycleRole,
  onSplitAbove,
  onFocus,
  onCaret,
  onStripEditing,
  onChordLine,
  onType,
  onKey,
  onPasteLines,
  noRoles = false,
}: {
  index: number;
  first: boolean;
  onDragOverRow: () => void;
  role: Role | null;
  tint: string;
  text: string;
  rawLine: string;
  /** Part of a drag selection: the lyric cell shows highlighted. */
  selected: boolean;
  onCellMouseDown: () => void;
  chords?: SongChords;
  stripClose: number;
  cellRef: (el: HTMLTextAreaElement | null) => void;
  autosize: (el: HTMLTextAreaElement | null) => void;
  onCycleRole: () => void;
  /** Absent on the phone (Slide break is in the dock there). */
  onSplitAbove?: () => void;
  onFocus: () => void;
  onCaret: (caret: number) => void;
  onStripEditing: (at: number | null) => void;
  onChordLine: (line: string) => void;
  onType: (value: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPasteLines: (lines: string[], caret: number) => void;
  /** No reader column (a Standard song as a table). */
  noRoles?: boolean;
}) {
  const bg = `color-mix(in oklab, ${tint} 8%, transparent)`;
  return (
    <>
      {/* The reader: the whole cell in its colour. Click to cycle. */}
      {!noRoles && (
        <button
          type="button"
          onClick={onCycleRole}
          onDragOver={(e) => {
            e.preventDefault();
            onDragOverRow();
          }}
          data-row={index}
          data-drag-row={index}
          title="Click to change who reads this line"
          aria-label={`Reader: ${role ? ROLE_LABEL[role] : "none"}`}
          className={`flex items-end border-b border-r px-2 pb-1.5 text-left transition ${
            role
              ? "text-[var(--brand-white)] hover:opacity-90"
              : "text-muted-foreground hover:bg-muted"
          }`}
          style={role ? { backgroundColor: tint } : undefined}
        >
          {/* A line box the size of the lyric's (text-sm, leading-relaxed, same
            padding), so the small label sits on the lyric's baseline. */}
          <span className="text-sm leading-relaxed">
            <span className="mono text-[10px] uppercase tracking-wider">
              {role ? ROLE_LABEL[role] : "Role"}
            </span>
          </span>
        </button>
      )}
      <div
        data-lyric-row={index}
        data-drag-row={noRoles ? index : undefined}
        className="relative flex min-w-0 flex-col justify-end border-b"
        style={{
          backgroundColor: selected
            ? "color-mix(in oklab, var(--brand-blue) 30%, transparent)"
            : bg,
        }}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverRow();
        }}
      >
        {/* Not on the phone: a tap between lines would split by accident. */}
        {!first && onSplitAbove && (
          // Hover the seam above this line to split the slide here.
          <button
            type="button"
            onClick={onSplitAbove}
            className="group absolute -top-1.5 left-0 right-0 z-10 flex h-3 items-center"
            aria-label="Start a new slide here"
          >
            <span className="h-0 w-full border-t border-dashed border-transparent group-hover:border-foreground/60" />
            <span className="mono absolute right-2 flex items-center gap-0.5 rounded-full bg-background px-1.5 text-[9px] uppercase tracking-wider text-muted-foreground opacity-0 group-hover:opacity-100">
              <Plus className="h-2.5 w-2.5" /> Slide break
            </span>
          </button>
        )}
        {chords && (
          <ChordStrip
            line={rawLine}
            chords={chords}
            onChange={onChordLine}
            onEditing={onStripEditing}
            closeSeq={stripClose}
          />
        )}
        <textarea
          ref={cellRef}
          rows={1}
          value={text.trim() ? text : ""}
          onMouseDown={onCellMouseDown}
          onFocus={onFocus}
          onSelect={(e) => onCaret(e.currentTarget.selectionStart)}
          onInput={(e) => autosize(e.currentTarget)}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKey}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").replace(/\r\n/g, "\n");
            if (!pasted.includes("\n")) return;
            e.preventDefault();
            onPasteLines(
              pasted.split("\n").map((l) => l.trim()),
              e.currentTarget.selectionStart,
            );
          }}
          className={`block w-full resize-none overflow-hidden bg-transparent py-1.5 pl-2 pr-2 text-sm leading-relaxed outline-none ${
            role === "people" ? "font-semibold" : ""
          }`}
        />
      </div>
    </>
  );
}
