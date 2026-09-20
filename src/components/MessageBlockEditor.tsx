import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Trash2 } from "lucide-react";
import { DotsGrip, hideDragGhost } from "@/components/DragBits";
import { AutoTextarea, BlockFrame, ElementCard, AddElementBar } from "@/components/MessageElements";
import { joinVerse } from "@/components/ScriptureVerseEditor";
import { SlideView } from "@/components/SlideView";
import { useLibrary } from "@/lib/store";
import type { Slide } from "@/lib/types";

// The same tints the scripture verse editor and the slide grid give each import.
const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];

type Block =
  | { kind: "import"; idx: number; key: string; slides: Slide[] }
  | { kind: "element"; key: string; slide: Slide };

/** Group a message's slides into blocks in their stored order: consecutive
 *  scripture verses of one import become one block; each point/image is its own.
 *  Verses join the running block when they share its import — by importIndex when
 *  present, otherwise by reference, so passages imported before importIndex
 *  existed still split by passage instead of collapsing into one block. */
function toBlocks(slides: Slide[]): Block[] {
  const blocks: Block[] = [];
  for (const s of slides) {
    if (s.kind === "scripture") {
      const idx = s.importIndex ?? 0;
      const last = blocks[blocks.length - 1];
      const lastVerse = last?.kind === "import" ? last.slides[last.slides.length - 1] : undefined;
      const sameImport =
        !!lastVerse &&
        (s.importIndex !== undefined && lastVerse.importIndex !== undefined
          ? lastVerse.importIndex === s.importIndex
          : (lastVerse.reference ?? "") === (s.reference ?? ""));
      if (last && last.kind === "import" && sameImport) last.slides.push(s);
      else blocks.push({ kind: "import", idx, key: `import-${s.id}`, slides: [s] });
    } else {
      blocks.push({ kind: "element", key: s.id, slide: s });
    }
  }
  return blocks;
}

const flatten = (blocks: Block[]): Slide[] =>
  blocks.flatMap((b) => (b.kind === "import" ? b.slides : [b.slide]));

/**
 * The message editor. Every imported passage, point and image is a draggable
 * block, so a reading, a picture and a quote can sit in any order — the block
 * order IS the slide order. Verses keep the scripture editor's exact look.
 * (`versions` is a single entry today; the machinery is kept so a second
 * translation can drop in later.)
 */
export function MessageBlockEditor({
  setId,
  versions,
  primaryVersion = versions[0],
  readOnly = false,
}: {
  setId: string;
  /** The versions shown (and editable) in this workspace, in order. */
  versions: string[];
  /** The set's first version, whose text also lives in the compat `lines`
   *  field. Differs from versions[0] when the workspace shows another one. */
  primaryVersion?: string;
  /** Frozen (version mismatch): verses are greyed and can't be edited, nothing
   *  can be added or reordered; blocks can still be deleted. */
  readOnly?: boolean;
}) {
  const slides = useLibrary((s) => s.sets[setId]?.slides ?? []);
  const updateSet = useLibrary((s) => s.updateSet);
  const updateSlide = useLibrary((s) => s.updateSlide);
  const removeSlide = useLibrary((s) => s.removeSlide);

  // During a drag we reorder a local copy of the slides so the list follows the
  // pointer, and only write the final order to the store on drop (rather than on
  // every dragover, which would thrash sync).
  const [liveOrder, setLiveOrder] = useState<Slide[] | null>(null);
  const liveRef = useRef<Slide[] | null>(null);
  const dragFrom = useRef<number | null>(null);
  const display = liveOrder ?? slides;
  const blocks = useMemo(() => toBlocks(display), [display]);

  const dragOver = (i: number) => {
    const from = dragFrom.current;
    if (from === null || from === i) return;
    const next = [...blocks];
    const [m] = next.splice(from, 1);
    next.splice(i, 0, m);
    dragFrom.current = i;
    const flat = flatten(next);
    liveRef.current = flat;
    setLiveOrder(flat);
  };
  const commitOrder = () => {
    dragFrom.current = null;
    if (liveRef.current) updateSet(setId, { slides: liveRef.current });
    liveRef.current = null;
    setLiveOrder(null);
  };

  // Drag down a version column to select a run of verses across the whole
  // message, exactly like the song editor. Verses are numbered in slide order so
  // a range can span separate import blocks.
  const verseSeq = new Map<string, number>();
  {
    let seq = 0;
    for (const s of display) if (s.kind === "scripture") verseSeq.set(s.id, seq++);
  }
  const [colSel, setColSel] = useState<{ version: string; from: number; to: number } | null>(null);
  const colDragAnchor = useRef<{ version: string; seq: number } | null>(null);
  const onCellMouseDown = (version: string, seq: number) => {
    setColSel(null);
    colDragAnchor.current = { version, seq };
    const onMove = (e: MouseEvent) => {
      const anchor = colDragAnchor.current;
      if (!anchor) return;
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cell = under?.closest?.("[data-verse-version]") as HTMLElement | null;
      if (!cell || cell.getAttribute("data-verse-version") !== anchor.version) return;
      const s = Number(cell.getAttribute("data-verse-seq"));
      if (Number.isNaN(s) || s === anchor.seq) {
        setColSel(null);
        return;
      }
      window.getSelection()?.removeAllRanges();
      setColSel({
        version: anchor.version,
        from: Math.min(anchor.seq, s),
        to: Math.max(anchor.seq, s),
      });
    };
    const onUp = () => {
      colDragAnchor.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  useEffect(() => {
    if (!colSel) return;
    const onCopy = (e: ClipboardEvent) => {
      const text = display
        .filter((s) => s.kind === "scripture")
        .filter((s) => {
          const seq = verseSeq.get(s.id);
          return seq !== undefined && seq >= colSel.from && seq <= colSel.to;
        })
        .map(
          (s) =>
            s.linesByVersion?.[colSel.version] ??
            (colSel.version === primaryVersion ? (s.lines?.[0] ?? "") : ""),
        )
        .join("\n");
      e.clipboardData?.setData("text/plain", text);
      e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colSel, display]);

  const removeBlock = (b: Block) => {
    if (b.kind === "import") {
      const ids = new Set(b.slides.map((s) => s.id));
      updateSet(setId, { slides: slides.filter((s) => !ids.has(s.id)) });
    } else {
      removeSlide(setId, b.slide.id);
    }
  };

  // Colour by block: each scripture import is its own colour; a run of consecutive
  // points is one colour and a run of consecutive images is another, so images
  // read as their own section, separate from points. Same scheme as the right
  // preview, so a block reads as the same colour everywhere.
  const tints: string[] = [];
  let colorIndex = -1;
  let lastColorKey: string | undefined;
  for (const b of blocks) {
    const colorKey =
      b.kind === "import" ? `i${b.idx}` : b.slide.kind === "image" ? "images" : "points";
    if (colorKey !== lastColorKey) colorIndex += 1;
    lastColorKey = colorKey;
    tints.push(TINTS[colorIndex % TINTS.length]);
  }

  const dragProps = (i: number) => ({
    onDragStart: (e: React.DragEvent) => {
      dragFrom.current = i;
      hideDragGhost(e);
    },
    onDragEnd: commitOrder,
    onDragOver: (e: React.DragEvent) => {
      if (dragFrom.current === null) return;
      e.preventDefault();
      dragOver(i);
    },
    // Commit on drop as well as dragend: the live reorder re-renders the list
    // under the cursor, and if the dragged node is remounted meanwhile the
    // browser never fires dragend on it. Drop fires on the target, which is
    // always mounted. The ref guard makes the second call a no-op.
    onDrop: (e: React.DragEvent) => {
      if (dragFrom.current === null) return;
      e.preventDefault();
      commitOrder();
    },
  });

  // Render blocks in order, but coalesce a run of TWO OR MORE consecutive
  // image blocks into a 2-up grid of 16:9 thumbnails (matching the media set
  // editor and the projected proportions). A single image is an ordinary card
  // with the grip and delete button, like a point or a passage.
  const rows: React.ReactNode[] = [];
  let imageRunNo = 0;
  for (let i = 0; i < blocks.length; ) {
    const b = blocks[i];
    const runLength = (() => {
      let n = 0;
      while (i + n < blocks.length) {
        const bi = blocks[i + n];
        if (bi.kind !== "element" || bi.slide.kind !== "image") break;
        n += 1;
      }
      return n;
    })();
    if (runLength >= 2) {
      const run: { slide: Slide; key: string; i: number }[] = [];
      for (let n = 0; n < runLength; n += 1) {
        const bi = blocks[i + n] as Extract<Block, { kind: "element" }>;
        run.push({ slide: bi.slide, key: bi.key, i: i + n });
      }
      i += runLength;
      // Keyed by the run's ordinal, not its first image, so reordering inside
      // the grid doesn't remount the grid (and the element being dragged).
      imageRunNo += 1;
      const dropOnRun = dragProps(run[0].i).onDrop;
      rows.push(
        <div
          key={`images-run-${imageRunNo}`}
          className="grid grid-cols-2 gap-2 p-3"
          style={{ backgroundColor: `color-mix(in oklab, ${tints[run[0].i]} 8%, transparent)` }}
          onDrop={dropOnRun}
        >
          {run.map(({ slide, key, i: bi }) => {
            const dp = dragProps(bi);
            return (
              <div
                key={key}
                draggable
                onDragStart={dp.onDragStart}
                onDragEnd={dp.onDragEnd}
                onDragOver={dp.onDragOver}
                onDrop={dp.onDrop}
                className="group relative aspect-video cursor-grab overflow-hidden rounded-md border border-foreground/10"
              >
                <SlideView
                  slide={slide}
                  versions={versions[0] === "_" ? undefined : versions}
                  variant="thumb"
                />
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() =>
                      updateSlide(setId, slide.id, {
                        imageFit: slide.imageFit === "cover" ? "contain" : "cover",
                      })
                    }
                    className="rounded-full bg-black/60 p-1 text-white"
                    aria-label={
                      slide.imageFit === "cover" ? "Fit image (contain)" : "Fill frame (cover)"
                    }
                    title={slide.imageFit === "cover" ? "Fit image" : "Fill frame"}
                  >
                    {slide.imageFit === "cover" ? (
                      <Minimize2 className="h-3 w-3" />
                    ) : (
                      <Maximize2 className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSlide(setId, slide.id)}
                    className="rounded-full bg-black/60 p-1 text-white"
                    aria-label="Remove image"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>,
      );
      continue;
    }

    const grip = <Grip onDragStart={dragProps(i).onDragStart} onDragEnd={commitOrder} />;
    rows.push(
      <div key={b.key} onDragOver={dragProps(i).onDragOver} onDrop={dragProps(i).onDrop}>
        {b.kind === "import" ? (
          <ImportBlock
            versions={versions}
            primaryVersion={primaryVersion}
            readOnly={readOnly}
            slides={b.slides}
            tint={tints[i]}
            grip={grip}
            seqOf={(id) => verseSeq.get(id)}
            colSel={colSel}
            onCellMouseDown={onCellMouseDown}
            onEdit={(slide, v, val) => {
              const patch: Partial<Slide> = {
                linesByVersion: { ...(slide.linesByVersion ?? {}), [v]: val },
              };
              if (v === primaryVersion) patch.lines = [val];
              updateSlide(setId, slide.id, patch);
            }}
            onMergeUp={(slide) => {
              // Join this verse onto the one above, within its import, in every
              // version; the slide below goes away.
              const idx = b.slides.findIndex((x) => x.id === slide.id);
              if (idx <= 0) return;
              const prev = b.slides[idx - 1];
              const all = new Set([
                ...Object.keys(prev.linesByVersion ?? {}),
                ...Object.keys(slide.linesByVersion ?? {}),
                primaryVersion,
              ]);
              const linesByVersion: Record<string, string> = {};
              for (const v of all) {
                const a =
                  prev.linesByVersion?.[v] ?? (v === primaryVersion ? (prev.lines?.[0] ?? "") : "");
                const c =
                  slide.linesByVersion?.[v] ??
                  (v === primaryVersion ? (slide.lines?.[0] ?? "") : "");
                const joined = joinVerse(a, c);
                if (joined) linesByVersion[v] = joined;
              }
              const primaryText = linesByVersion[primaryVersion] ?? "";
              updateSet(setId, {
                slides: slides
                  .map((x) =>
                    x.id === prev.id
                      ? { ...x, linesByVersion, lines: primaryText ? [primaryText] : [] }
                      : x,
                  )
                  .filter((x) => x.id !== slide.id),
              });
            }}
            onRemove={() => removeBlock(b)}
          />
        ) : (
          <ElementCard
            slide={b.slide}
            onChange={(patch) => updateSlide(setId, b.slide.id, patch)}
            onRemove={() => removeBlock(b)}
            grip={grip}
            tint={tints[i]}
          />
        )}
      </div>,
    );
    i += 1;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Frozen: nothing in a message can be edited, deleted or reordered
          (points and images included) until the versions are updated. */}
      {readOnly ? <div className="pointer-events-none opacity-50">{rows}</div> : rows}
      {!readOnly && (
        <div className="p-4">
          <AddElementBar setId={setId} />
        </div>
      )}
    </div>
  );
}

function Grip({
  onDragStart,
  onDragEnd,
}: {
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="flex cursor-grab items-center"
      title="Drag to reorder this block"
    >
      <DotsGrip className="opacity-40" size={12} />
    </span>
  );
}

function ImportBlock({
  versions,
  primaryVersion,
  slides,
  tint,
  grip,
  seqOf,
  colSel,
  onCellMouseDown,
  onEdit,
  onMergeUp,
  onRemove,
  readOnly = false,
}: {
  versions: string[];
  primaryVersion: string;
  readOnly?: boolean;
  slides: Slide[];
  tint: string;
  grip: React.ReactNode;
  seqOf: (id: string) => number | undefined;
  colSel: { version: string; from: number; to: number } | null;
  onCellMouseDown: (version: string, seq: number) => void;
  onEdit: (slide: Slide, version: string, value: string) => void;
  /** Backspace at the start of a verse: join it onto the verse above. */
  onMergeUp: (slide: Slide) => void;
  onRemove: () => void;
}) {
  const primary = primaryVersion;
  const reference = slides[0]?.referencesByVersion?.[primary] ?? slides[0]?.reference ?? "Passage";
  const cols = `repeat(${versions.length}, minmax(0, 1fr))`;

  return (
    <BlockFrame label={reference} grip={grip} onRemove={onRemove} tint={tint}>
      {slides.map((s) => {
        const seq = seqOf(s.id);
        return (
          <div
            key={s.id}
            className="grid divide-x border-b last:border-b-0"
            style={{ gridTemplateColumns: cols }}
          >
            {versions.map((v) => (
              <AutoTextarea
                key={v}
                value={s.linesByVersion?.[v] ?? (v === primary ? (s.lines?.[0] ?? "") : "")}
                onChange={(val) => onEdit(s, v, val)}
                disabled={readOnly}
                onKeyDown={(e) => {
                  const el = e.currentTarget;
                  if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
                    e.preventDefault();
                    onMergeUp(s);
                  }
                }}
                data={
                  seq !== undefined ? { "data-verse-version": v, "data-verse-seq": seq } : undefined
                }
                onMouseDown={seq !== undefined ? () => onCellMouseDown(v, seq) : undefined}
                selected={
                  !!colSel &&
                  colSel.version === v &&
                  seq !== undefined &&
                  seq >= colSel.from &&
                  seq <= colSel.to
                }
              />
            ))}
          </div>
        );
      })}
    </BlockFrame>
  );
}
