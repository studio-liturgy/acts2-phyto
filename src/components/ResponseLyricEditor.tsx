import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  breakAfter,
  breakBefore,
  fromDoc,
  mergeIntoPrevious,
  moveLine,
  insertLines,
  neighbourLine,
  removeLine,
  responseRows,
  setLine,
  toDoc,
  type Doc,
} from "@/lib/response-grid";
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
 * press Cmd+Enter to break after the line you're in (the cursor moves past
 * it). A break shows as a line across the grid (x removes it). Sections are
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

  const cycleRole = (index: number) => {
    const d = doc();
    commit(setLine(d, index, d.lines[index], nextRole(d.roles[index])));
  };

  const addSection = () => {
    const at = focusIndex.current ?? lyrics.split("\n").length;
    const d = doc();
    commit(insertLines(d, at, ["[Chorus]"], [null]));
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
      onClick={addSection}
      className="mono ml-3 flex h-7 items-center gap-1 rounded-full border border-dashed px-3 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
      title="Add a section above the line your cursor is on"
    >
      <Plus className="h-3 w-3" />
      Section
    </button>
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => commit({ lines: [" "], roles: ["leader"] }, { index: 0, caret: 0 })}
          className="mono flex h-7 items-center gap-1 rounded-full border border-dashed px-3 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Line
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      {toolbarSlot ? createPortal(sectionButton, toolbarSlot) : sectionButton}

      <div className="catalogue-scroll min-h-0 flex-1 overflow-auto rounded-lg border">
        <div className="grid" style={{ gridTemplateColumns: `${FIRST_COL} minmax(0, 1fr)` }}>
          {rows.map((row) => {
            if (row.kind === "section") {
              return (
                <div
                  key={row.index}
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
                    className="flex shrink-0 cursor-grab items-center pl-2"
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
                    onClick={() => commit(removeLine(doc(), row.index))}
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
                    className="flex shrink-0 cursor-grab items-center px-2"
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

            const role = roles[row.index] ?? null;
            const tint = role ? ROLE_COLOR[role] : "transparent";
            const text = stripChordsRaw(row.text.trim() === "" ? "" : row.text);
            return (
              <Line
                key={row.index}
                index={row.index}
                first={row.first}
                onDragOverRow={() => dragOver(row.index)}
                role={role}
                tint={tint}
                text={text}
                chords={chords}
                rawLine={row.text}
                stripClose={stripClose}
                cellRef={(el) => {
                  if (el) {
                    cells.current.set(row.index, el);
                    autosize(el);
                  } else cells.current.delete(row.index);
                }}
                autosize={autosize}
                onCycleRole={() => cycleRole(row.index)}
                onSplitAbove={() => commit(breakBefore(doc(), row.index), undefined, false, true)}
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
                    // A slide break after this line; the cursor goes past it.
                    e.preventDefault();
                    const { doc: next, focus } = breakAfter(d, row.index, role);
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
            className="mono flex items-center justify-center gap-1 border-t py-2 text-xs uppercase tracking-wider opacity-50 hover:opacity-100"
          >
            <Plus className="h-3 w-3" /> Line
          </button>
        </div>
      </div>

      <p className="mono text-[10px] uppercase tracking-wider opacity-40">
        Click a role to change it · Cmd+Enter: new slide
      </p>
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
}: {
  index: number;
  first: boolean;
  onDragOverRow: () => void;
  role: Role | null;
  tint: string;
  text: string;
  rawLine: string;
  chords?: SongChords;
  stripClose: number;
  cellRef: (el: HTMLTextAreaElement | null) => void;
  autosize: (el: HTMLTextAreaElement | null) => void;
  onCycleRole: () => void;
  onSplitAbove: () => void;
  onFocus: () => void;
  onCaret: (caret: number) => void;
  onStripEditing: (at: number | null) => void;
  onChordLine: (line: string) => void;
  onType: (value: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPasteLines: (lines: string[], caret: number) => void;
}) {
  const bg = `color-mix(in oklab, ${tint} 8%, transparent)`;
  return (
    <>
      {/* The reader: the whole cell in its colour. Click to cycle. */}
      <button
        type="button"
        onClick={onCycleRole}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverRow();
        }}
        data-row={index}
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
      <div
        className="relative flex min-w-0 flex-col justify-end border-b"
        style={{ backgroundColor: bg }}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverRow();
        }}
      >
        {!first && (
          // Hover the seam above this line to split the slide here.
          <button
            type="button"
            onClick={onSplitAbove}
            className="group absolute -top-1.5 left-0 right-0 z-10 flex h-3 items-center"
            aria-label="Start a new slide here"
          >
            <span className="h-0 w-full border-t border-dashed border-transparent group-hover:border-foreground/60" />
            <span className="mono absolute right-2 rounded-full bg-background px-1.5 text-[9px] uppercase tracking-wider text-muted-foreground opacity-0 group-hover:opacity-100">
              Split
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
