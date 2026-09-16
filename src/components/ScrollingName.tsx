import { useRef, useState } from "react";

/** A single-line name that, when it's too long to fit, scrolls left on hover to
 *  reveal the rest — after a short pause — then springs back on mouse-out. When
 *  it fits, it behaves like a plain truncating label (ellipsis, no motion). */
export function ScrollingName({ text, className = "" }: { text: string; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [hovering, setHovering] = useState(false);
  const [offset, setOffset] = useState(0);

  const onEnter = () => {
    const box = boxRef.current;
    const t = textRef.current;
    if (box && t) {
      const overflow = t.scrollWidth - box.clientWidth;
      setOffset(overflow > 1 ? overflow : 0);
    }
    setHovering(true);
  };

  // Constant reveal speed (~45px/s), so long titles don't whip past.
  const durationS = offset > 0 ? Math.max(0.5, offset / 45) : 0;

  return (
    <div
      ref={boxRef}
      className={`overflow-hidden ${className}`}
      onMouseEnter={onEnter}
      onMouseLeave={() => setHovering(false)}
    >
      <span
        ref={textRef}
        className="block whitespace-nowrap will-change-transform"
        style={{
          // Idle: ordinary ellipsis. Hovering: let the text overflow the box so
          // the box's clip (not the span's) reveals the tail as it slides.
          overflow: hovering ? "visible" : "hidden",
          textOverflow: hovering ? "clip" : "ellipsis",
          transform: hovering && offset > 0 ? `translateX(${-offset}px)` : "translateX(0)",
          transition:
            hovering && offset > 0 ? `transform ${durationS}s linear 0.4s` : "transform 0.25s ease",
        }}
      >
        {text}
      </span>
    </div>
  );
}
