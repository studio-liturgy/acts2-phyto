// Custom drag ghosts (the image the browser shows under the pointer while
// dragging). Kept out of components/DragBits so that file exports only
// components, which React Fast Refresh needs.
import type { DragEvent } from "react";

/** Off-screen host element for drag ghost images. */
const _circleCache: Record<string, HTMLDivElement> = {};
let _ghostHost: HTMLDivElement | null = null;
function ensureGhostHost(): HTMLDivElement {
  if (_ghostHost) return _ghostHost;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;top:-1000px;left:-1000px;pointer-events:none;z-index:-1;";
  document.body.appendChild(host);
  _ghostHost = host;
  return host;
}

/** Cached empty 1×1 transparent image to suppress the default drag ghost. */
let _emptyDragImage: HTMLImageElement | null = null;
function emptyDragImage(): HTMLImageElement {
  if (_emptyDragImage) return _emptyDragImage;
  const img = new Image();
  img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  ensureGhostHost().appendChild(img);
  _emptyDragImage = img;
  return img;
}

// Pre-warm on module load so the ghost is ready before any drag starts.
if (typeof document !== "undefined") emptyDragImage();

/**
 * Hide the rectangular browser drag preview so dragged pills stay visually
 * rounded. Call inside onDragStart.
 */
export function hideDragGhost(e: DragEvent) {
  try {
    e.dataTransfer.setDragImage(emptyDragImage(), 0, 0);
  } catch {
    /* noop */
  }
}
function circleDragElement(color: string, size = 56): HTMLDivElement {
  const key = `${color}-${size}`;
  if (_circleCache[key]) return _circleCache[key];
  const host = ensureGhostHost();
  const el = document.createElement("div");
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};`;
  host.appendChild(el);
  _circleCache[key] = el;
  return el;
}

/** Use a solid colored circle as the drag ghost. */
export function setCircleDragGhost(e: DragEvent, color: string, size = 56) {
  try {
    const el = circleDragElement(color, size);
    e.dataTransfer.setDragImage(el, size / 2, size / 2);
  } catch {
    /* noop */
  }
}
