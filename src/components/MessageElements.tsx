import { useState } from "react";
import { Trash2, Maximize2, Minimize2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { prepareImageFile } from "@/lib/image-upload";
import { useLibrary } from "@/lib/store";
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
    <div className="space-y-3 border-t border-foreground/20 p-4">
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
export function AutoTextarea({
  value,
  onChange,
  placeholder,
  className = FIELD,
  data,
  onMouseDown,
  selected,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** data-* attributes, e.g. for identifying the cell during a drag-select. */
  data?: Record<string, string | number>;
  onMouseDown?: () => void;
  selected?: boolean;
}) {
  const size = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  return (
    <textarea
      ref={size}
      rows={1}
      value={value}
      onInput={(e) => size(e.currentTarget)}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={onMouseDown}
      placeholder={placeholder}
      className={className}
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
  children,
}: {
  label: string;
  grip?: React.ReactNode;
  onRemove: () => void;
  /** A brand-colour token; when set the block gets the same faint tint the
   *  scripture editor gives each imported passage. */
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex border-b border-foreground/15"
      style={tint ? { backgroundColor: `color-mix(in oklab, ${tint} 8%, transparent)` } : undefined}
    >
      <span className="flex shrink-0 items-start justify-center pt-2" style={{ width: GRAB }}>
        {grip}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mono px-3 pt-2 text-[10px] uppercase tracking-wider opacity-50">
          {label}
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
}: {
  slide: Slide;
  onChange: (patch: Partial<Slide>) => void;
  onRemove: () => void;
  grip?: React.ReactNode;
  tint?: string;
}) {
  const label =
    slide.kind === "image"
      ? "Image"
      : slide.pointType === "quote"
        ? "Quote"
        : slide.pointType === "bullets"
          ? "Bullet points"
          : "Statement";

  return (
    <BlockFrame label={label} grip={grip} onRemove={onRemove} tint={tint}>
      {slide.kind === "image" ? (
        <div className="relative px-3 py-2">
          <img
            src={slide.imageUrl}
            alt=""
            className={`max-h-40 w-full rounded border border-foreground/10 ${
              slide.imageFit === "cover" ? "object-cover" : "object-contain"
            }`}
          />
          <button
            type="button"
            onClick={() => onChange({ imageFit: slide.imageFit === "cover" ? "contain" : "cover" })}
            className="absolute right-4 top-3 rounded-full bg-black/60 p-1 text-white transition hover:opacity-90"
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
