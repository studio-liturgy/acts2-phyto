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

/** Cached empty 1×1 transparent image to suppress the default drag ghost. */
let _emptyDragImage: HTMLImageElement | null = null;
function emptyDragImage(): HTMLImageElement {
  if (_emptyDragImage) return _emptyDragImage;
  const img = new Image();
  img.src =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  _emptyDragImage = img;
  return img;
}

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

/** Cache colored circle drag canvases by color string. */
const _circleCache: Record<string, HTMLCanvasElement> = {};
function circleDragCanvas(color: string, size = 56): HTMLCanvasElement {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const key = `${color}-${size}-${dpr}`;
  if (_circleCache[key]) return _circleCache[key];
  const canvas = document.createElement("canvas");
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  _circleCache[key] = canvas;
  return canvas;
}

/** Use a solid colored circle as the drag ghost. */
export function setCircleDragGhost(e: React.DragEvent, color: string, size = 56) {
  try {
    const canvas = circleDragCanvas(color, size);
    e.dataTransfer.setDragImage(canvas, size / 2, size / 2);
  } catch {
    /* noop */
  }
}
