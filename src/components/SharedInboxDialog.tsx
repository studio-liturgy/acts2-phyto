import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { previewText } from "@/lib/set-preview";
import type { InboxShare } from "@/lib/sync";

const KIND_LABEL: Record<string, string> = {
  song: "Song",
  scripture: "Scripture",
  media: "Media",
  mixed: "Mixed",
};

function kindColor(kind: string): string {
  if (kind === "song") return "var(--brand-blue)";
  if (kind === "scripture") return "var(--brand-green)";
  if (kind === "media") return "var(--brand-orange)";
  return "var(--foreground)";
}

/**
 * Incoming shared sets: a list dialog opened from the count pill above Gatherings.
 * Hovering a row shows a chord-free text preview that follows the cursor (mirrors
 * the song-import preview in the set editor). Save adds it to the library; Dismiss
 * removes you from the set after a confirmation.
 */
export function SharedInboxDialog({
  open,
  onOpenChange,
  shares,
  onSave,
  onDismiss,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shares: InboxShare[];
  onSave: (share: InboxShare) => void;
  onDismiss: (share: InboxShare) => void;
}) {
  const [preview, setPreview] = useState<{ text: string; x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<InboxShare | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          <DialogTitle className="text-2xl font-normal leading-tight">Shared with you</DialogTitle>
          <p className="mono uppercase mt-2 text-[10px] tracking-wider text-muted-foreground">
            Hover to preview. Save to add it to your library and edit it together.
          </p>

          <ul className="mt-6 space-y-2">
            {shares.map((share) => (
              <li
                key={share.shareId}
                onMouseEnter={(e) =>
                  setPreview({ text: previewText(share.set), x: e.clientX, y: e.clientY })
                }
                onMouseMove={(e) =>
                  setPreview((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p))
                }
                onMouseLeave={() => setPreview(null)}
                className="flex items-center gap-3 rounded-2xl border border-foreground px-4 py-3"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: kindColor(share.set.kind) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base">{share.set.name}</div>
                  <div className="mono truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                    {KIND_LABEL[share.set.kind] ?? share.set.kind}
                    {share.ownerEmail ? ` · from ${share.ownerEmail}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSave(share)}
                  className="mono uppercase shrink-0 rounded-full bg-foreground px-4 py-1.5 text-xs tracking-wider text-background transition hover:opacity-90"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm(share)}
                  className="mono uppercase shrink-0 rounded-full border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>

          {preview && preview.text && (
            <div
              className="mono pointer-events-none fixed z-[100] whitespace-pre-line rounded-2xl border border-foreground bg-background p-3 text-[11px] leading-relaxed shadow-lg"
              style={(() => {
                const W = 240;
                const H = 200;
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
              {preview.text}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Dismiss this shared set?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            This removes you from “{confirm?.set.name}” completely. You'll lose access, and it won't
            come back unless the owner shares it with you again.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (confirm) onDismiss(confirm);
                setConfirm(null);
              }}
              className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90"
            >
              Remove me
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
    </>
  );
}
