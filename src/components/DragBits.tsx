import type { CSSProperties } from "react";

/** 4-dot grip indicator matching the design mockups. */
export function DotsGrip({
  className = "",
  size = 14,
  style,
}: {
  className?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={style}
      fill="currentColor"
    >
      <circle cx="3.5" cy="3.5" r="1.2" />
      <circle cx="8.5" cy="3.5" r="1.2" />
      <circle cx="3.5" cy="8.5" r="1.2" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </svg>
  );
}

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
export function hideDragGhost(e: React.DragEvent) {
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
export function setCircleDragGhost(e: React.DragEvent, color: string, size = 56) {
  try {
    const el = circleDragElement(color, size);
    e.dataTransfer.setDragImage(el, size / 2, size / 2);
  } catch {
    /* noop */
  }
}
