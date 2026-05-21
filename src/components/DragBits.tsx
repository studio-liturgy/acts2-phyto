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

/** Cache colored circle drag images by color string. */
const _circleCache: Record<string, HTMLImageElement> = {};
function circleDragImage(color: string, size = 56): HTMLImageElement {
  const key = `${color}-${size}`;
  if (_circleCache[key]) return _circleCache[key];
  const r = size / 2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><circle cx='${r}' cy='${r}' r='${r - 1}' fill='${color}'/></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  _circleCache[key] = img;
  return img;
}

/** Use a solid colored circle as the drag ghost. */
export function setCircleDragGhost(e: React.DragEvent, color: string, size = 56) {
  try {
    const img = circleDragImage(color, size);
    e.dataTransfer.setDragImage(img, size / 2, size / 2);
  } catch {
    /* noop */
  }
}
