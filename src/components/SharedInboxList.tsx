import { useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { previewText } from "@/lib/set-preview";
import type { InboxShare } from "@/lib/sync";
import type { Set as PhytoSet } from "@/lib/types";

/** Full-colour pill classes, matching the catalogue rows. */
function kindBg(kind: string): string {
  if (kind === "song") return "bg-[var(--brand-blue)] text-[var(--brand-white)]";
  if (kind === "scripture") return "bg-[var(--brand-green)] text-[var(--brand-white)]";
  if (kind === "media") return "bg-[var(--brand-orange)] text-[var(--brand-white)]";
  return "bg-muted text-foreground";
}

/** Slides worth previewing as images (media). */
function imageSlides(set: PhytoSet) {
  return set.slides.filter((s) => s.imageUrl).slice(0, 4);
}

/**
 * Incoming shared sets, rendered inline below the notification pill (not a modal),
 * as full-colour pills matching the catalogue. Hovering a row shows a preview that
 * follows the cursor — chord-free text for songs/scripture, actual slide
 * thumbnails for media — portaled to <body> so it's placed against the viewport.
 * Save adds it to the library; Remove takes you off the set after a confirmation.
 */
export function SharedInboxList({
  shares,
  onSave,
  onSaveAll,
  onRemove,
  inGroupWorkspace = false,
}: {
  shares: InboxShare[];
  onSave: (share: InboxShare) => void;
  onSaveAll: () => void;
  onRemove: (share: InboxShare) => void;
  inGroupWorkspace?: boolean;
}) {
  const [preview, setPreview] = useState<{ set: PhytoSet; x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<InboxShare | null>(null);
  // Saving while viewing a group is confirmed first: shared sets always land in
  // the personal library (only their owner can add them to a group).
  const [confirmSave, setConfirmSave] = useState<InboxShare | "all" | null>(null);

  const mediaThumbs = preview ? imageSlides(preview.set) : [];
  const showImages = preview?.set.kind === "media" && mediaThumbs.length > 0;

  const requestSave = (share: InboxShare) =>
    inGroupWorkspace ? setConfirmSave(share) : onSave(share);
  const requestSaveAll = () => (inGroupWorkspace ? setConfirmSave("all") : onSaveAll());

  return (
    <div>
      {shares.length > 1 && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={requestSaveAll}
            className="pill mono uppercase border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
          >
            Save all
          </button>
        </div>
      )}
      <ul className="space-y-1.5">
        {shares.map((share) => (
          <li
            key={share.shareId}
            onMouseEnter={(e) => setPreview({ set: share.set, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => setPreview((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p))}
            onMouseLeave={() => setPreview(null)}
            className={`pill flex items-center gap-4 px-5 py-2 ${kindBg(share.set.kind)}`}
          >
            <span className="flex-1 truncate text-base">{share.set.name}</span>
            {share.ownerEmail && (
              <span className="mono mr-8 hidden whitespace-nowrap text-[10px] uppercase tracking-wider opacity-50 sm:inline">
                {share.ownerEmail}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => requestSave(share)}
                className="mono uppercase rounded-full bg-white/20 px-4 py-1.5 text-xs tracking-wider transition hover:bg-white/30"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setConfirm(share)}
                className="mono uppercase rounded-full border border-white/40 px-4 py-1.5 text-xs tracking-wider transition hover:bg-white/20"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {preview &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="mono pointer-events-none fixed z-[100] rounded-2xl border border-foreground bg-background p-3 text-[11px] leading-relaxed shadow-lg"
            style={(() => {
              const W = 240;
              const H = 220;
              const GAP = 16;
              const vw = window.innerWidth;
              const vh = window.innerHeight;
              const left =
                preview.x + W + GAP > vw ? Math.max(8, preview.x - W - GAP) : preview.x + GAP;
              const top =
                preview.y + H + GAP > vh ? Math.max(8, preview.y - H - GAP) : preview.y + GAP;
              return { left, top, width: W, maxHeight: H, overflow: "hidden" };
            })()}
          >
            {showImages ? (
              <div className="grid grid-cols-2 gap-1">
                {mediaThumbs.map((s) => (
                  <img
                    key={s.id}
                    src={s.imageUrl}
                    alt=""
                    className="aspect-video w-full rounded object-cover"
                  />
                ))}
              </div>
            ) : (
              <div className="whitespace-pre-line">{previewText(preview.set)}</div>
            )}
          </div>,
          document.body,
        )}

      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Remove this shared set?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            This removes you from “{confirm?.set.name}” completely. You'll lose access, and it won't
            come back unless the owner shares it with you again.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (confirm) onRemove(confirm);
                setConfirm(null);
              }}
              className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmSave !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmSave(null);
        }}
      >
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Save to your library?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            You're viewing a group, but shared sets are saved to your personal library — only a
            set's owner can add it to a group.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                const c = confirmSave;
                setConfirmSave(null);
                if (c === "all") onSaveAll();
                else if (c) onSave(c);
              }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setConfirmSave(null)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
