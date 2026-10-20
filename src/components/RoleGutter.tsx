import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ROLE_LABEL, ROLE_LETTER, type RoleGutterRow } from "@/lib/song-roles";

/**
 * Call and Response: a column of toggles down the left of the lyrics box, one
 * beside each lyric line. Clicking cycles the line through Leader (L), People
 * (P), All (A) and back to no role.
 *
 * The box soft-wraps, so a line's height depends on its length. A hidden copy
 * of the box (same width, padding and font) is laid out line by line to find
 * where each line starts, and the toggles follow the box's scroll.
 */
export function RoleGutter({
  boxRef,
  boxText,
  rows,
  onCycle,
}: {
  boxRef: RefObject<HTMLTextAreaElement | null>;
  boxText: string;
  rows: RoleGutterRow[];
  onCycle: (storedLine: number) => void;
}) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<number[]>([]);
  const [lineHeight, setLineHeight] = useState(16);
  const [scroll, setScroll] = useState(0);
  const [width, setWidth] = useState(0);

  // Track the box's width (wrapping) and scroll position.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onScroll = () => setScroll(box.scrollTop);
    const ro = new ResizeObserver(() => setWidth(box.clientWidth));
    ro.observe(box);
    box.addEventListener("scroll", onScroll);
    setWidth(box.clientWidth);
    onScroll();
    return () => {
      ro.disconnect();
      box.removeEventListener("scroll", onScroll);
    };
  }, [boxRef]);

  // Lay the mirror out like the box and read where each line starts.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const mirror = mirrorRef.current;
    if (!box || !mirror) return;
    const cs = getComputedStyle(box);
    for (const prop of [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "letterSpacing",
      "lineHeight",
      "paddingTop",
      "paddingLeft",
      "paddingRight",
      "tabSize",
    ] as const) {
      mirror.style[prop] = cs[prop];
    }
    mirror.style.width = `${box.clientWidth}px`;
    const lh = parseFloat(cs.lineHeight);
    if (!Number.isNaN(lh)) setLineHeight(lh);
    setTops(Array.from(mirror.children).map((el) => (el as HTMLElement).offsetTop));
  }, [boxRef, boxText, width]);

  return (
    <>
      <div
        ref={mirrorRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre-wrap break-words"
        style={{ boxSizing: "border-box" }}
      >
        {boxText.split("\n").map((line, i) => (
          <div key={i}>{line || "\u200b"}</div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 overflow-hidden">
        {rows.map((r) => {
          const top = tops[r.boxLine];
          if (top === undefined) return null;
          const label = r.role ? ROLE_LABEL[r.role] : "No role";
          return (
            <button
              key={`${r.boxLine}-${r.storedLine}`}
              type="button"
              // Keep the box's caret and focus where they are.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onCycle(r.storedLine)}
              title={`${label}. Click to change`}
              aria-label={`Line role: ${label}`}
              className={`mono pointer-events-auto absolute left-3 flex h-5 w-5 items-center justify-center rounded-full text-[10px] uppercase transition ${
                r.role
                  ? "bg-foreground text-background hover:opacity-80"
                  : "border border-foreground/25 text-transparent hover:border-foreground/60"
              }`}
              style={{ top: top - scroll + (lineHeight - 20) / 2 }}
            >
              {r.role ? ROLE_LETTER[r.role] : ""}
            </button>
          );
        })}
      </div>
    </>
  );
}
