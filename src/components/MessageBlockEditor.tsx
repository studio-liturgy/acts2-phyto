import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Plus, Trash2 } from "lucide-react";
import { DotsGrip, hideDragGhost } from "@/components/DragBits";
import { BlockFrame, ElementCard, AddElementBar } from "@/components/MessageElements";
import { RichText } from "@/components/RichText";
import { currentCaret, useUndo } from "@/hooks/use-undo";
import { plainLength, splitMarkup } from "@/lib/inline-format";
import { focusCell } from "@/lib/rich-caret";
import { joinVerse } from "@/components/ScriptureVerseEditor";
import { SlideView } from "@/components/SlideView";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLibrary } from "@/lib/store";
import type { Slide } from "@/lib/types";

// The same tints the scripture verse editor and the slide grid give each import.
const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];

type Block =
  | { kind: "import"; idx: number; key: string; slides: Slide[] }
  | { kind: "element"; key: string; slide: Slide }
  /** Two or more consecutive images: one block, dragged and deleted as a
   *  unit; the images inside reorder among themselves only. */
  | { kind: "images"; key: string; slides: Slide[] };

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
  // Coalesce runs of two or more images. The key is order-independent within
  // the run (sorted ids), so reordering images inside it doesn't remount the
  // block mid-drag.
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; ) {
    let n = 0;
    while (i + n < blocks.length) {
      const b = blocks[i + n];
      if (b.kind !== "element" || b.slide.kind !== "image") break;
      n += 1;
    }
    if (n >= 2) {
      const run = blocks
        .slice(i, i + n)
        .map((b) => (b as Extract<Block, { kind: "element" }>).slide);
      out.push({
        kind: "images",
        key: `images-${run
          .map((sl) => sl.id)
          .sort()
          .join("+")}`,
        slides: run,
      });
      i += n;
    } else {
      out.push(blocks[i]);
      i += 1;
    }
  }
  return out;
}

const flatten = (blocks: Block[]): Slide[] =>
  blocks.flatMap((b) => (b.kind === "element" ? [b.slide] : b.slides));

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
  onManualVerse,
}: {
  setId: string;
  /** Adds a blank hand-typed verse block at the end (the add-bar's button). */
  onManualVerse?: () => void;
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

  // Cmd/Ctrl+Z over the message: text, formatting, joins and splits, adding
  // and deleting elements, reordering.
  const scope = useRef<HTMLDivElement | null>(null);
  const history = useUndo({
    value: slides,
    apply: (next) => updateSet(setId, { slides: next }),
    scope,
    // The library re-derives the slides from Dexie after a write: the same
    // content in a fresh array isn't a change.
    equals: (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b),
  });
  const record = (key?: string) => history.record(currentCaret(scope.current), key);

  // During a drag we reorder a local copy of the slides so the list follows the
  // pointer, and only write the final order to the store on drop (rather than on
  // every dragover, which would thrash sync).
  const [liveOrder, setLiveOrder] = useState<Slide[] | null>(null);
  const liveRef = useRef<Slide[] | null>(null);
  const dragFrom = useRef<number | null>(null);
  const display = liveOrder ?? slides;
  const blocks = useMemo(() => toBlocks(display), [display]);

  // Moving a block reflows what's under the cursor (an image leaving the 2-up
  // grid turns the grid into a single card), and a naive "move on any
  // dragover" then moves it straight back: the two positions flicker. So a move
  // only happens once the pointer has crossed the target's midpoint in the
  // direction of travel, and never twice within a short cooldown.
  const lastMoveAt = useRef(0);
  const pulledId = useRef<string | null>(null);
  const dragOver = (i: number, e?: React.DragEvent) => {
    // An image dragged out of its run over another block leaves the run and
    // becomes a block of its own, placed next to that block; from here on it
    // moves like any block (and joins another run if dropped beside images).
    const t = tileDrag.current;
    if (t) {
      if (t.block === i) return;
      const run = blocks[t.block];
      if (run.kind !== "images") return;
      const slide = run.slides[t.from];
      const rest = run.slides.filter((_, k) => k !== t.from);
      const next = blocks.map((b, k) => (k === t.block ? { ...b, slides: rest } : b)) as Block[];
      const at = i < t.block ? i : i + 1;
      next.splice(at, 0, { kind: "element", key: slide.id, slide });
      tileDrag.current = null;
      dragFrom.current = at;
      pulledId.current = slide.id;
      lastMoveAt.current = performance.now();
      const flat = flatten(next);
      liveRef.current = flat;
      setLiveOrder(flat);
      return;
    }
    // A pulled-out image may since have joined a run of images (blocks
    // re-derive from the live order), so find its block by id.
    if (pulledId.current !== null) {
      const id = pulledId.current;
      const k = blocks.findIndex((b) =>
        b.kind === "element"
          ? b.slide.id === id
          : b.kind === "images" && b.slides.some((x) => x.id === id),
      );
      if (k !== -1) dragFrom.current = k;
    }
    const from = dragFrom.current;
    if (from === null || from === i) return;
    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const forward = i > from;
      const midY = rect.top + rect.height / 2;
      const midX = rect.left + rect.width / 2;
      // Past the midpoint on the main axis (down/up), or, for targets side by
      // side in the image grid, on the cross axis (right/left).
      const crossedY = forward ? e.clientY > midY : e.clientY < midY;
      const crossedX = forward ? e.clientX > midX : e.clientX < midX;
      if (!crossedY && !crossedX) return;
      if (performance.now() - lastMoveAt.current < 150) return;
      lastMoveAt.current = performance.now();
    }
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
    pulledId.current = null;
    if (liveRef.current) {
      record();
      updateSet(setId, { slides: liveRef.current });
    }
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
    record();
    if (b.kind === "element") {
      removeSlide(setId, b.slide.id);
    } else {
      const ids = new Set(b.slides.map((s) => s.id));
      updateSet(setId, { slides: slides.filter((s) => !ids.has(s.id)) });
    }
  };
  // Deleting a whole run of images asks first.
  const [confirmImages, setConfirmImages] = useState<Block | null>(null);

  // Reordering an image INSIDE its run: a separate, contained drag, so it
  // never reflows the blocks around it (the cause of the flicker).
  const tileDrag = useRef<{ block: number; from: number } | null>(null);
  const tileOver = (blockIdx: number, to: number, e: React.DragEvent) => {
    const t = tileDrag.current;
    if (!t || t.block !== blockIdx || t.from === to) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const forward = to > t.from;
    const mid = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    if (!(forward ? e.clientX > mid || e.clientY > midY : e.clientX < mid || e.clientY < midY)) {
      return;
    }
    const block = blocks[blockIdx];
    if (block.kind !== "images") return;
    const run = [...block.slides];
    const [m] = run.splice(t.from, 1);
    run.splice(to, 0, m);
    tileDrag.current = { block: blockIdx, from: to };
    const next = blocks.map((b, i) => (i === blockIdx ? { ...b, slides: run } : b)) as Block[];
    const flat = flatten(next);
    liveRef.current = flat;
    setLiveOrder(flat);
  };
  const tileCommit = () => {
    tileDrag.current = null;
    commitOrder();
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
      b.kind === "import"
        ? `i${b.idx}`
        : b.kind === "images" || b.slide.kind === "image"
          ? "images"
          : "points";
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
      if (dragFrom.current === null && !tileDrag.current) return;
      e.preventDefault();
      dragOver(i, e);
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

  // Render the blocks in order. A run of images is one block: a frame with the
  // grip (drags the whole run) and the delete (removes the whole run), holding
  // a 2-up grid of 16:9 thumbnails that reorder among themselves.
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    if (b.kind === "images") {
      const grip = <Grip onDragStart={dragProps(i).onDragStart} onDragEnd={commitOrder} />;
      rows.push(
        <div key={b.key} onDragOver={dragProps(i).onDragOver} onDrop={dragProps(i).onDrop}>
          <BlockFrame
            label="Images"
            grip={grip}
            onRemove={() => setConfirmImages(b)}
            tint={tints[i]}
          >
            <div className="grid grid-cols-2 gap-2 px-3 py-2">
              {b.slides.map((slide, ti) => (
                <div
                  key={slide.id}
                  draggable={!readOnly}
                  onDragStart={(e) => {
                    if (readOnly) return;
                    e.stopPropagation();
                    tileDrag.current = { block: i, from: ti };
                    hideDragGhost(e);
                  }}
                  onDragOver={(e) => {
                    if (!tileDrag.current) return;
                    e.preventDefault();
                    e.stopPropagation();
                    tileOver(i, ti, e);
                  }}
                  onDrop={(e) => {
                    if (!tileDrag.current) return;
                    e.preventDefault();
                    e.stopPropagation();
                    tileCommit();
                  }}
                  onDragEnd={() => {
                    if (tileDrag.current) tileCommit();
                  }}
                  className={`group relative aspect-video overflow-hidden rounded-md border border-foreground/10 ${readOnly ? "" : "cursor-grab"}`}
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
              ))}
            </div>
          </BlockFrame>
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
              record(`type:${slide.id}:${v}`);
              const patch: Partial<Slide> = {
                linesByVersion: { ...(slide.linesByVersion ?? {}), [v]: val },
              };
              if (v === primaryVersion) patch.lines = [val];
              updateSlide(setId, slide.id, patch);
            }}
            onEditRef={(v, value) => {
              // The reference belongs to the whole block: every verse in it.
              const ref = value.replace(/[[\]\n\r]/g, "").replace(/^~+/, "");
              record(`ref:${b.key}:${v}`);
              for (const slide of b.slides) {
                const referencesByVersion = { ...(slide.referencesByVersion ?? {}) };
                if (ref) referencesByVersion[v] = ref;
                else delete referencesByVersion[v];
                const patch: Partial<Slide> = { referencesByVersion };
                if (v === primaryVersion) {
                  patch.reference = ref || undefined;
                  patch.section = ref || undefined;
                }
                updateSlide(setId, slide.id, patch);
              }
            }}
            onMergeUp={(slide, v) => {
              // Join this verse onto the one above, within its import, in every
              // version; the slide below goes away.
              const idx = b.slides.findIndex((x) => x.id === slide.id);
              if (idx <= 0) return;
              const prev = b.slides[idx - 1];
              record();
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
              // The caret lands at the seam, where the verse was split.
              const seam = plainLength(
                (
                  prev.linesByVersion?.[v] ?? (v === primaryVersion ? (prev.lines?.[0] ?? "") : "")
                ).trimEnd(),
              );
              focusCell(scope.current, `${prev.id}:${v}`, seam);
            }}
            onSplit={(slide, v, at) => {
              // The tail after the caret goes to the verse below: into the
              // next verse of this passage when its cell for `v` is blank,
              // else into a new verse (blank in the other versions).
              const i = slides.findIndex((x) => x.id === slide.id);
              if (i === -1) return;
              const textOf = (x: Slide, version: string) =>
                x.linesByVersion?.[version] ??
                (version === primaryVersion ? (x.lines?.[0] ?? "") : "");
              const [rawHead, rawTail] = splitMarkup(textOf(slide, v), at);
              const head = rawHead.trimEnd();
              const tail = rawTail.trimStart();
              const withText = (x: Slide, version: string, text: string): Slide => {
                const linesByVersion = { ...(x.linesByVersion ?? {}), [version]: text };
                const pText = linesByVersion[primaryVersion] ?? "";
                return { ...x, linesByVersion, lines: pText ? [pText] : [] };
              };
              const below = slides[i + 1];
              const blankBelow =
                !!below &&
                below.kind === "scripture" &&
                below.importIndex === slide.importIndex &&
                !textOf(below, v).trim();
              const freshId = Math.random().toString(36).slice(2, 10);
              record();
              const next = blankBelow
                ? slides.map((x, j) =>
                    j === i ? withText(x, v, head) : j === i + 1 ? withText(x, v, tail) : x,
                  )
                : [
                    ...slides.slice(0, i),
                    withText(slide, v, head),
                    withText(
                      {
                        ...slide,
                        id: freshId,
                        lines: [],
                        linesByVersion: Object.fromEntries(versions.map((ver) => [ver, ""])),
                      },
                      v,
                      tail,
                    ),
                    ...slides.slice(i + 1),
                  ];
              updateSet(setId, { slides: next });
              // The caret moves down to the start of the verse below.
              focusCell(scope.current, `${blankBelow ? below.id : freshId}:${v}`, 0);
            }}
            onRemove={() => removeBlock(b)}
          />
        ) : (
          <ElementCard
            slide={b.slide}
            onChange={(patch, typing) => {
              record(typing ? `type:${b.slide.id}:${typing}` : undefined);
              updateSlide(setId, b.slide.id, patch);
            }}
            onRemove={() => removeBlock(b)}
            grip={grip}
            tint={tints[i]}
            dragHandle={{ onDragStart: dragProps(i).onDragStart, onDragEnd: commitOrder }}
            versions={versions[0] === "_" ? undefined : versions}
          />
        )}
      </div>,
    );
  }

  return (
    <div
      ref={scope}
      data-rich-cells
      onKeyDown={(e) => {
        if (readOnly) return;
        history.onKeyDown(e, () => currentCaret(scope.current));
      }}
      // A drop anywhere in the editor (below the last block, say) commits the
      // live order: the dragged node may have been remounted mid-drag, in
      // which case the browser never fires dragend on it.
      onDragOver={(e) => {
        if (dragFrom.current !== null || tileDrag.current) e.preventDefault();
      }}
      onDrop={(e) => {
        if (dragFrom.current === null && !tileDrag.current) return;
        e.preventDefault();
        tileDrag.current = null;
        commitOrder();
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      {/* Frozen: nothing in a message can be edited, deleted or reordered
          (points and images included) until the versions are updated. */}
      {readOnly ? <div className="pointer-events-none opacity-50">{rows}</div> : rows}
      <AlertDialog open={confirmImages !== null} onOpenChange={(o) => !o && setConfirmImages(null)}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Delete {confirmImages?.kind === "images" ? confirmImages.slides.length : ""} images?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Every image in this section is removed from the message. This cannot be undone.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (confirmImages) removeBlock(confirmImages);
                setConfirmImages(null);
              }}
              className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmImages(null)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {!readOnly && (
        <div className="p-4">
          <AddElementBar setId={setId} onManualVerse={onManualVerse} />
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
  onSplit,
  onEditRef,
  onRemove,
  readOnly = false,
}: {
  versions: string[];
  primaryVersion: string;
  readOnly?: boolean;
  /** A hand-typed block's reference in one version, typed in above its column. */
  onEditRef: (version: string, value: string) => void;
  /** Split a verse at a caret position in one version (Cmd/Ctrl+Enter, +). */
  onSplit: (slide: Slide, version: string, at: number) => void;
  slides: Slide[];
  tint: string;
  grip: React.ReactNode;
  seqOf: (id: string) => number | undefined;
  colSel: { version: string; from: number; to: number } | null;
  onCellMouseDown: (version: string, seq: number) => void;
  onEdit: (slide: Slide, version: string, value: string) => void;
  /** Backspace at the start of a verse: join it onto the verse above. */
  onMergeUp: (slide: Slide, version: string) => void;
  onRemove: () => void;
}) {
  const primary = primaryVersion;
  const manual = !!slides[0]?.manual;
  const refOf = (v: string) =>
    slides[0]?.referencesByVersion?.[v] ??
    (v === primary && !manual ? (slides[0]?.reference ?? "Passage") : "");
  const reference = refOf(primary) || (manual ? "Manual verse" : "Passage");
  const cols = `repeat(${versions.length}, minmax(0, 1fr))`;
  // Where the caret last was in this passage, for the + button.
  const lastCaret = useRef<{ slide: Slide; v: string; at: number } | null>(null);
  const splitAtCaret = () => {
    const c = lastCaret.current;
    if (c && slides.some((sl) => sl.id === c.slide.id)) onSplit(c.slide, c.v, c.at);
    else {
      const last = slides[slides.length - 1];
      if (last)
        onSplit(
          last,
          primary,
          plainLength(last.linesByVersion?.[primary] ?? last.lines?.[0] ?? ""),
        );
    }
  };

  return (
    <BlockFrame
      name={reference}
      label={
        // One reference per import, in each version's own language above its
        // column; a hand-typed block's are typed in here.
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          {versions.map((v) =>
            manual ? (
              <input
                key={v}
                type="text"
                value={refOf(v)}
                placeholder={v === "_" ? "Reference" : `Reference (${v})`}
                disabled={readOnly}
                aria-label={`Reference (${v})`}
                onChange={(e) => onEditRef(v, e.target.value)}
                className="mono w-full min-w-0 bg-transparent px-3 pt-2 text-[10px] uppercase tracking-wider opacity-70 outline-none placeholder:opacity-40 focus:opacity-100 disabled:opacity-30"
              />
            ) : (
              <div
                key={v}
                className="mono truncate px-3 pt-2 text-[10px] uppercase tracking-wider opacity-50"
              >
                {refOf(v)}
              </div>
            ),
          )}
        </div>
      }
      grip={grip}
      onRemove={onRemove}
      tint={tint}
      actions={
        readOnly ? undefined : (
          <button
            type="button"
            aria-label="Split the verse at the cursor"
            title="Split the verse at the cursor (Cmd/Ctrl+Enter)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={splitAtCaret}
            className="flex h-6 w-6 items-center justify-center rounded-full text-foreground/60 transition hover:bg-foreground/15 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )
      }
    >
      {slides.map((s) => {
        const seq = seqOf(s.id);
        return (
          <div
            key={s.id}
            className="grid divide-x border-b last:border-b-0"
            style={{ gridTemplateColumns: cols }}
          >
            {versions.map((v) => (
              <RichText
                key={v}
                cellId={`${s.id}:${v}`}
                col={v}
                colFirst={v === versions[0]}
                value={s.linesByVersion?.[v] ?? (v === primary ? (s.lines?.[0] ?? "") : "")}
                onChange={(val) => onEdit(s, v, val)}
                disabled={readOnly}
                onFocus={(at) => (lastCaret.current = { slide: s, v, at })}
                onCaret={(at) => (lastCaret.current = { slide: s, v, at })}
                onKeyDown={({ e, at, collapsed }) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    onSplit(s, v, at);
                    return true;
                  }
                  if (e.key === "Backspace" && collapsed && at === 0) {
                    e.preventDefault();
                    onMergeUp(s, v);
                    return true;
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
