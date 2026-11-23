// Swipe between sets in the phone live view (PhoneViewer). A swipe changes
// set only when it is clearly sideways: the finger must travel at least
// MIN_DX across and at least twice as far across as it ever moved up or down
// during the touch. Scrolling the words with a thumb that drifts sideways, or
// any angled swipe, keeps the current set.

const MIN_DX = 50;
const RATIO = 2;

export interface SwipeTrack {
  x: number;
  y: number;
  /** Largest vertical distance from the start seen during the touch. */
  maxDy: number;
}

export function startSwipe(x: number, y: number): SwipeTrack {
  return { x, y, maxDy: 0 };
}

export function moveSwipe(t: SwipeTrack, _x: number, y: number): SwipeTrack {
  return { ...t, maxDy: Math.max(t.maxDy, Math.abs(y - t.y)) };
}

/** 1 = next set, -1 = previous set, 0 = stay. */
export function swipeStep(t: SwipeTrack, x: number, y: number): -1 | 0 | 1 {
  const dx = x - t.x;
  const maxDy = Math.max(t.maxDy, Math.abs(y - t.y));
  if (Math.abs(dx) < MIN_DX || Math.abs(dx) < RATIO * maxDy) return 0;
  return dx < 0 ? 1 : -1;
}
