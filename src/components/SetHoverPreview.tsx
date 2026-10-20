import { createPortal } from "react-dom";
import { previewText, type SetPreviewAt } from "@/lib/set-preview";

/**
 * The card that follows the cursor over a set row: its slides' words (or, for
 * media, the first images). Shared by the shared-sets inbox and Fix duplicates.
 * Portalled to the body above dialogs, and never takes the pointer.
 */
export function SetHoverPreview({ preview }: { preview: SetPreviewAt | null }) {
  if (!preview || typeof document === "undefined") return null;
  const thumbs = preview.set.slides.filter((s) => s.imageUrl).slice(0, 4);
  const showImages = preview.set.kind === "media" && thumbs.length > 0;
  const W = 240;
  const H = 220;
  const GAP = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = preview.x + W + GAP > vw ? Math.max(8, preview.x - W - GAP) : preview.x + GAP;
  const top = preview.y + H + GAP > vh ? Math.max(8, preview.y - H - GAP) : preview.y + GAP;
  return createPortal(
    <div
      className="mono pointer-events-none fixed z-[100] rounded-2xl border border-foreground bg-background p-3 text-[11px] leading-relaxed shadow-lg"
      style={{ left, top, width: W, maxHeight: H, overflow: "hidden" }}
    >
      {showImages ? (
        <div className="grid grid-cols-2 gap-1">
          {thumbs.map((s) => (
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
  );
}
