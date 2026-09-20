import { useEffect, useRef, useState } from "react";
import { Trash2, Maximize2, Minimize2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PillSwitch } from "@/components/PillSwitch";
import { prepareImageFile } from "@/lib/image-upload";
import { useLibrary } from "@/lib/store";
import { SlideView } from "@/components/SlideView";
import { applyFormatShortcut } from "@/lib/inline-format";
import type { PointType, Slide } from "@/lib/types";

const POINT_TYPES: { type: PointType; label: string }[] = [
  { type: "quote", label: "Quote" },
  { type: "bullets", label: "Bullet points" },
  { type: "statement", label: "Statement" },
];

/**
 * The centred "add an image / add a point" controls. Adding either turns the
 * (scripture) set into a message, so a plain reading can grow a quote, a list,
 * or a picture without a separate kind. New elements land at the end; the block
 * editor lets them be dragged anywhere afterwards.
 */
export function AddElementBar({ setId }: { setId: string }) {
  const addSlide = useLibrary((s) => s.addSlide);
  const updateSet = useLibrary((s) => s.updateSet);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const becomeMessage = () => {
    if (useLibrary.getState().sets[setId]?.kind !== "message") {
      updateSet(setId, { kind: "message" });
    }
  };

  const addImage = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const img = await prepareImageFile(file, () =>
        setErr("Out of storage. Remove some media first."),
      );
      if (img) {
        addSlide(setId, { kind: "image", imageUrl: img.url, lines: [] });
        becomeMessage();
      } else {
        setErr((e) => e ?? "That image could not be read.");
      }
    } finally {
      setBusy(false);
    }
  };

  const addPoint = (type: PointType) => {
    const base: Omit<Slide, "id"> =
      type === "bullets"
        ? { kind: "point", pointType: "bullets", title: "", lines: [""] }
        : type === "quote"
          ? { kind: "point", pointType: "quote", lines: [""], attribution: "" }
          : { kind: "point", pointType: "statement", lines: [""] };
    addSlide(setId, base);
    becomeMessage();
  };

  return (
    <div className="space-y-2">
      {err && (
        <p className="mono uppercase text-center text-[10px] tracking-wider text-destructive">
          {err}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="mono rounded-full border border-foreground px-4 py-1.5 text-xs uppercase tracking-wider transition hover:bg-foreground hover:text-background"
            >
              Add a point
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="dark:border-white">
            {POINT_TYPES.map((pt) => (
              <DropdownMenuItem
                key={pt.type}
                onSelect={() => addPoint(pt.type)}
                className="mono text-xs uppercase tracking-wider"
              >
                {pt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <label
          className={`mono cursor-pointer rounded-full border border-foreground px-4 py-1.5 text-xs uppercase tracking-wider transition hover:bg-foreground hover:text-background ${busy ? "opacity-50" : ""}`}
        >
          {busy ? "Adding…" : "Add an image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => addImage(e.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Shown below a plain scripture set's verse editor: a hint plus the add-bar. As
 * soon as an image or point is added the set becomes a message and the block
 * editor takes over, so this only ever shows the controls (never element cards).
 */
export function MessageElements({ setId, hasVerses }: { setId: string; hasVerses: boolean }) {
  return (
    // The top border only separates the add-bar from verses ABOVE it. When the
    // set is empty there are no verses, so it would sit directly against the
    // importer's own bottom border — two lines reading as one thick rule. Drop it
    // in that case so the empty state shows a single thin line like the song set.
    <div className={`space-y-3 p-4 ${hasVerses ? "border-t border-foreground/20" : ""}`}>
      {!hasVerses && (
        <p className="mono text-center text-[10px] uppercase leading-relaxed tracking-wider opacity-50">
          Import a passage above, or add an image or a point to build a message.
        </p>
      )}
      <AddElementBar setId={setId} />
    </div>
  );
}

// The message blocks share the scripture verse editor's visual language: a
// grip column on the left, a delete column on the right, and borderless fields
// (no rounded pills), so points and images sit consistently beside the verses.
export const GRAB = "1.75rem";
export const DEL = "2rem";
// A borderless field matching the verse cells.
const FIELD =
  "mono w-full resize-none overflow-hidden bg-transparent px-3 py-2 text-xs outline-none";

/** An auto-growing, borderless textarea styled like a scripture verse cell.
 *  Optionally participates in column drag-selection (data attrs + highlight). */
/** Size a textarea to its content without disturbing the scroll position of
 *  the nearest scrolling ancestor. Shared by the verse editors. */
export function autosizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  let scroller: HTMLElement | null = el.parentElement;
  while (scroller && scroller.scrollHeight <= scroller.clientHeight)
    scroller = scroller.parentElement;
  const top = scroller?.scrollTop ?? 0;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
  if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
}

export function AutoTextarea({
  value,
  onChange,
  placeholder,
  className = FIELD,
  data,
  onMouseDown,
  onKeyDown,
  selected,
  disabled = false,
  onFocus,
  onSelectCaret,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** data-* attributes, e.g. for identifying the cell during a drag-select. */
  data?: Record<string, string | number>;
  onMouseDown?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  selected?: boolean;
  disabled?: boolean;
  onFocus?: (el: HTMLTextAreaElement) => void;
  /** The caret moved (click, keys): its new position. */
  onSelectCaret?: (at: number) => void;
}) {
  // Grow to fit. Sizing sets the height to "auto" for an instant, which lets
  // a scrolling ancestor shrink and clamp its scroll position (the list jumped
  // to the top on every edit), so the ancestor's scrollTop is kept across the
  // measurement, and sizing runs only when the text changes, not every render.
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    autosizeTextarea(ref.current);
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={onMouseDown}
      onFocus={(e) => onFocus?.(e.currentTarget)}
      onSelect={(e) => onSelectCaret?.(e.currentTarget.selectionStart ?? 0)}
      onKeyDown={(e) => {
        // Cmd/Ctrl + B / I / U: bold, italic, underline (see lib/inline-format).
        const next = applyFormatShortcut(e);
        if (next !== null) {
          onChange(next);
          return;
        }
        onKeyDown?.(e);
      }}
      placeholder={placeholder}
      className={`${className} disabled:opacity-40`}
      style={
        selected
          ? { backgroundColor: "color-mix(in oklab, var(--foreground) 18%, transparent)" }
          : undefined
      }
      {...data}
    />
  );
}

/** The grip + content + delete frame every message block uses. */
export function BlockFrame({
  label,
  grip,
  onRemove,
  tint,
  actions,
  children,
}: {
  label: string;
  grip?: React.ReactNode;
  onRemove: () => void;
  /** A brand-colour token; when set the block gets the same faint tint the
   *  scripture editor gives each imported passage. */
  tint?: string;
  /** Extra per-block controls, shown just left of the delete button. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex border-b border-foreground/15"
      style={
        tint ? { backgroundColor: `color-mix(in oklab, ${tint} 30%, transparent)` } : undefined
      }
    >
      <span className="flex shrink-0 items-start justify-center pt-2" style={{ width: GRAB }}>
        {grip}
      </span>
      <div className="min-w-0 flex-1">
        {/* The actions sit in the label row, so the content below (and any
            rule under a heading) runs the full width, as in every block. */}
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <div className="mono text-[10px] uppercase tracking-wider opacity-50">{label}</div>
          {actions}
        </div>
        {children}
      </div>
      <div className="flex shrink-0 items-start justify-center pt-1.5" style={{ width: DEL }}>
        <button
          type="button"
          aria-label={`Delete ${label.toLowerCase()}`}
          onClick={onRemove}
          className="flex h-6 w-6 items-center justify-center rounded-full text-foreground/60 transition hover:bg-foreground/15 hover:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The inline editor for one point or image element of a message. */
export function ElementCard({
  slide,
  onChange,
  onRemove,
  grip,
  tint,
  dragHandle,
  versions,
}: {
  slide: Slide;
  onChange: (patch: Partial<Slide>) => void;
  onRemove: () => void;
  grip?: React.ReactNode;
  tint?: string;
  /** Lets the image preview itself start the block's drag, like the grip. */
  dragHandle?: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
  /** Bible versions to stack in a scripture preview; not used for images. */
  versions?: string[];
}) {
  const label =
    slide.kind === "image"
      ? "Image"
      : slide.pointType === "quote"
        ? "Quote"
        : slide.pointType === "bullets"
          ? "Bullet points"
          : "Statement";

  // Bullet points: dots (left, off) or numbers (right, on), as a small switch
  // like the chords toggle in the song editor.
  const numbered = slide.listStyle === "numbers";
  const listToggle =
    slide.kind === "point" && slide.pointType === "bullets" ? (
      <label
        className="mono flex cursor-pointer items-center gap-1.5 text-[11px] leading-none"
        title={numbered ? "Numbered list" : "Bullet dots"}
      >
        <span aria-hidden>{"\u2022"}</span>
        <PillSwitch
          checked={numbered}
          onCheckedChange={(on) => onChange({ listStyle: on ? "numbers" : "bullets" })}
          label="Numbered list"
          dimWhenOff={false}
        />
        <span aria-hidden>1.</span>
      </label>
    ) : undefined;

  return (
    <BlockFrame label={label} grip={grip} onRemove={onRemove} tint={tint} actions={listToggle}>
      {slide.kind === "image" ? (
        // The image as it projects (a 16:9 slide thumbnail), the same as one in
        // a run of images; draggable by the preview as well as the grip.
        <div className="relative px-3 py-2">
          <div
            draggable={!!dragHandle}
            onDragStart={dragHandle?.onDragStart}
            onDragEnd={dragHandle?.onDragEnd}
            className={`group relative aspect-video w-1/2 overflow-hidden rounded-md border border-foreground/10 ${dragHandle ? "cursor-grab" : ""}`}
          >
            <SlideView slide={slide} versions={versions} variant="thumb" />
            <button
              type="button"
              onClick={() =>
                onChange({ imageFit: slide.imageFit === "cover" ? "contain" : "cover" })
              }
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
              aria-label={slide.imageFit === "cover" ? "Fit image (contain)" : "Fill frame (cover)"}
              title={slide.imageFit === "cover" ? "Fit image" : "Fill frame"}
            >
              {slide.imageFit === "cover" ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
      ) : slide.pointType === "quote" ? (
        <>
          <div className="border-b">
            <AutoTextarea
              value={slide.lines?.[0] ?? ""}
              onChange={(v) => onChange({ lines: [v] })}
              placeholder="The quotation"
            />
          </div>
          <input
            value={slide.attribution ?? ""}
            onChange={(e) => onChange({ attribution: e.target.value })}
            onKeyDown={(e) => {
              const next = applyFormatShortcut(e);
              if (next !== null) onChange({ attribution: next });
            }}
            placeholder="Who said it (optional)"
            className={FIELD}
          />
        </>
      ) : slide.pointType === "bullets" ? (
        <>
          <div className="border-b">
            <input
              value={slide.title ?? ""}
              onChange={(e) => onChange({ title: e.target.value })}
              onKeyDown={(e) => {
                const next = applyFormatShortcut(e);
                if (next !== null) onChange({ title: next });
              }}
              placeholder="Heading (optional)"
              className={FIELD}
            />
          </div>
          <AutoTextarea
            value={(slide.lines ?? []).join("\n")}
            onChange={(v) => onChange({ lines: v.split("\n") })}
            placeholder="One bullet per line"
          />
        </>
      ) : (
        <AutoTextarea
          value={slide.lines?.[0] ?? ""}
          onChange={(v) => onChange({ lines: [v] })}
          placeholder="A short statement"
        />
      )}
    </BlockFrame>
  );
}
