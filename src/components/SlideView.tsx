import type { Slide } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

interface Props {
  slide?: Slide | null;
  /** "stage" = fullscreen output, "preview" = editor preview, "thumb" = small card. */
  variant?: "stage" | "thumb" | "preview";
  className?: string;
}

// Canonical stage size — all variants render at this size, then scale-to-fit.
const STAGE_W = 1920;
const STAGE_H = 1080;

/**
 * Renders a slide at a fixed 1920x1080 canvas and uses a CSS transform to
 * scale-to-fit any container. This guarantees that the editor preview, the
 * presenter preview, and the live output all wrap and lay out identically.
 */
export function SlideView({ slide, variant = "preview", className = "" }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setScale(Math.min(w / STAGE_W, h / STAGE_H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bg = slide?.imageUrl
    ? {
        backgroundImage: `url(${slide.imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  const aspect = variant === "stage" ? "h-full" : "aspect-video";

  return (
    <div
      ref={wrapRef}
      className={`relative ${aspect} w-full overflow-hidden bg-black text-white ${className}`}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale})`,
          ...bg,
        }}
      >
        {slide?.imageUrl && (slide.lines?.length || slide.title) ? (
          <div className="absolute inset-0 bg-black/40" />
        ) : null}
        <div className="relative flex h-full w-full flex-col items-center justify-center px-24 py-20 text-center">
          {slide?.title && (
            <div className="mb-10 text-7xl font-semibold leading-tight">{slide.title}</div>
          )}
          {slide?.lines?.map((l, i) => (
            <div key={i} className="text-6xl font-medium leading-snug">
              {l}
            </div>
          ))}
          {slide?.reference && (
            <div className="mt-12 text-3xl opacity-80">{slide.reference}</div>
          )}
          {!slide && <div className="text-3xl text-white/40">No slide selected</div>}
        </div>
      </div>
    </div>
  );
}
