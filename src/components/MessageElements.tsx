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
import { FIELD, RichText } from "@/components/RichText";
import type { PointType, Slide } from "@/lib/types";

const POINT_TYPES: { type: PointType; label: string }[] = [
  { type: "quote", label: "Quote" },
  { type: "bullets", label: "Bullet points" },
  { type: "statement", label: "Statement" },
];

/**
 * The centred "add a point / add an image / manual verse" controls. A point or
 * an image turns the (scripture) set into a message, so a plain reading can
 * grow a quote, a list, or a picture without a separate kind; a manual verse
 * is scripture typed in by hand and leaves the kind alone. New elements land
 * at the end; the block editor lets them be dragged anywhere afterwards.
 */
export function AddElementBar({
  setId,
  onManualVerse,
}: {
  setId: string;
  /** Adds a blank hand-typed verse (see useScriptureVersions.addManualVerse). */
  onManualVerse?: () => void;
}) {
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
        <p className="mono uppercase text-center text-[10px] tracking-wider text-[var(--brand-red)]">
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
        {onManualVerse && (
          <button
            type="button"
            onClick={onManualVerse}
            className="mono rounded-full border border-foreground px-4 py-1.5 text-xs uppercase tracking-wider transition hover:bg-foreground hover:text-background"
          >
            Manual verse
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Shown below a plain scripture set's verse editor: a hint plus the add-bar. As
 * soon as an image or point is added the set becomes a message and the block
 * editor takes over, so this only ever shows the controls (never element cards).
 */
export function MessageElements({
  setId,
  hasVerses,
  onManualVerse,
}: {
  setId: string;
  hasVerses: boolean;
  onManualVerse?: () => void;
}) {
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
      <AddElementBar setId={setId} onManualVerse={onManualVerse} />
    </div>
  );
}

// The message blocks share the scripture verse editor's visual language: a
// grip column on the left, a delete column on the right, and borderless fields
// (no rounded pills), so points and images sit consistently beside the verses.
export const GRAB = "1.75rem";
export const DEL = "2rem";
/** The grip + content + delete frame every message block uses. */
export function BlockFrame({
  label,
  name,
  grip,
  onRemove,
  tint,
  actions,
  children,
}: {
  label: React.ReactNode;
  /** What the delete button says it deletes; the label when that is a string. */
  name?: string;
  grip?: React.ReactNode;
  onRemove: () => void;
  /** A brand-colour token; when set the block gets the same faint tint the
   *  scripture editor gives each imported passage. */
  tint?: string;
  /** Extra per-block controls, shown beside the delete button. */
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
        {typeof label === "string" ? (
          <div className="mono px-3 pt-2 text-[10px] uppercase tracking-wider opacity-50">
            {label}
          </div>
        ) : (
          label
        )}
        {children}
      </div>
      {/* The actions sit right beside the delete button, in the same column,
          so the content (and any rule under a heading) runs the full width. */}
      <div className="flex shrink-0 items-start pt-1.5" style={{ minWidth: DEL }}>
        {actions}
        <button
          type="button"
          aria-label={`Delete ${(name ?? (typeof label === "string" ? label : "block")).toLowerCase()}`}
          onClick={onRemove}
          className="mr-1 flex h-6 w-6 items-center justify-center rounded-full text-foreground/60 transition hover:bg-foreground/15 hover:text-foreground"
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
  /** `typing` names the field when the change is a keystroke, so undo can
   *  gather a run of them into one step. */
  onChange: (patch: Partial<Slide>, typing?: string) => void;
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
            <RichText
              cellId={`${slide.id}:text`}
              value={slide.lines?.[0] ?? ""}
              onChange={(v) => onChange({ lines: [v] }, "text")}
              placeholder="The quotation"
            />
          </div>
          <RichText
            cellId={`${slide.id}:attribution`}
            singleLine
            value={slide.attribution ?? ""}
            onChange={(v) => onChange({ attribution: v }, "attribution")}
            placeholder="Who said it (optional)"
          />
        </>
      ) : slide.pointType === "bullets" ? (
        <>
          <div className="border-b">
            <RichText
              cellId={`${slide.id}:title`}
              singleLine
              value={slide.title ?? ""}
              onChange={(v) => onChange({ title: v }, "title")}
              placeholder="Heading (optional)"
            />
          </div>
          <RichText
            cellId={`${slide.id}:text`}
            value={(slide.lines ?? []).join("\n")}
            onChange={(v) => onChange({ lines: v.split("\n") }, "text")}
            placeholder="One bullet per line"
          />
        </>
      ) : (
        <RichText
          cellId={`${slide.id}:text`}
          value={slide.lines?.[0] ?? ""}
          onChange={(v) => onChange({ lines: [v] }, "text")}
          placeholder="A short statement"
        />
      )}
    </BlockFrame>
  );
}
