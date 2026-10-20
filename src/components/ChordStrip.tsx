import { useLayoutEffect, useRef, useState } from "react";
import { rawChordAnchors, renderChord, setChordAt, type SongChords } from "@/lib/chords";

/** The cell's text box: 14px text, 8px in from the left (pl-2). */
const CELL_FONT_PX = 14;
const CELL_PAD_PX = 8;

/**
 * Multilanguage grid, chords on: a short line of small chords above a cell's
 * words, each over the word it belongs to. Click above a word to add a chord
 * there (or click a chord to change it); Enter or clicking away keeps it, an
 * empty box removes it, Escape cancels.
 *
 * Positions come from measuring the words in the cell's own font, so the
 * chords line up with the text box below without sharing its font size.
 */
export function ChordStrip({
  line,
  chords,
  fontFamily,
  onChange,
}: {
  /** The stored line, chords inline: `Amazing (G)grace`. */
  line: string;
  chords: SongChords;
  fontFamily?: string;
  onChange: (line: string) => void;
}) {
  const { text, chords: anchors } = rawChordAnchors(line);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const font = `${CELL_FONT_PX}px ${fontFamily || "system-ui, -apple-system, sans-serif"}`;
  const xOf = (index: number) => {
    const ctx = (canvas.current ??= document.createElement("canvas")).getContext("2d");
    if (!ctx) return CELL_PAD_PX;
    ctx.font = font;
    return CELL_PAD_PX + ctx.measureText(text.slice(0, index)).width;
  };

  // The word starts a click can land on (and the end of the line).
  const wordStarts = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== " " && (i === 0 || text[i - 1] === " ")) out.push(i);
    }
    out.push(text.length);
    return out;
  };

  const startAt = (clientX: number, box: DOMRect) => {
    const x = clientX - box.left;
    let best = 0;
    for (const i of wordStarts()) if (xOf(i) <= x + 4) best = i;
    const existing = anchors.find((a) => a.index === best);
    setEditing({ index: best, value: existing?.chord ?? "" });
  };

  useLayoutEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const commit = () => {
    if (!editing) return;
    const next = setChordAt(line, editing.index, editing.value.trim() || null);
    setEditing(null);
    if (next !== line) onChange(next);
  };

  return (
    <div
      className="mono relative h-4 cursor-text text-[10px] leading-4 text-[var(--brand-blue)]"
      onMouseDown={(e) => {
        // Don't start the column drag or move the cell's caret.
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          e.preventDefault();
          startAt(e.clientX, e.currentTarget.getBoundingClientRect());
        }
      }}
      title="Click above a word to add a chord"
    >
      {anchors.map((a, k) =>
        editing?.index === a.index ? null : (
          <button
            key={`${a.index}-${k}`}
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setEditing({ index: a.index, value: a.chord });
            }}
            className="absolute top-0 whitespace-nowrap font-semibold hover:underline"
            style={{ left: xOf(a.index) }}
          >
            {renderChord(a.chord, chords)}
          </button>
        ),
      )}
      {editing && (
        <input
          ref={input}
          value={editing.value}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(null);
            }
          }}
          aria-label="Chord"
          className="absolute top-0 h-4 w-14 rounded border border-[var(--brand-blue)] bg-background px-0.5 font-semibold outline-none"
          style={{ left: xOf(editing.index) - 2 }}
        />
      )}
    </div>
  );
}
