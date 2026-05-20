import type { Slide } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

interface Props {
  slide?: Slide | null;
  /** "stage" = fullscreen output, "preview" = editor preview, "thumb" = small card. */
  variant?: "stage" | "thumb" | "preview";
  className?: string;
  /** Background-size for image slides. Defaults to "contain" so vertical images aren't cropped. */
  imageFit?: "contain" | "cover";
}

// Canonical stage size — all variants render at this size, then scale-to-fit.
const STAGE_W = 1920;
const STAGE_H = 1080;

/**
 * Renders a slide at a fixed 1920x1080 canvas and uses a CSS transform to
 * scale-to-fit any container. Guarantees identical wrapping/layout across
 * editor preview, presenter preview, and live output.
 */
export function SlideView({
  slide,
  variant = "preview",
  className = "",
  imageFit = "contain",
}: Props) {
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

  const hasText = !!(slide?.lines?.some((l) => l.trim()) || slide?.title);
  const bg = slide?.imageUrl
    ? {
        backgroundImage: `url(${slide.imageUrl})`,
        backgroundSize: imageFit,
        backgroundRepeat: "no-repeat" as const,
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
        {slide?.imageUrl && hasText ? <div className="absolute inset-0 bg-black/40" /> : null}
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

/**
 * Cross-dissolves between slides. Keeps the previous slide rendered while
 * the new one fades in over `durationMs`. Pure CSS — no extra deps.
 */
export function DissolveSlide({
  slide,
  variant = "stage",
  durationMs = 0,
  className = "",
  imageFit,
}: Props & { durationMs?: number }) {
  const [layers, setLayers] = useState<{ id: string; slide: Slide | null | undefined; visible: boolean }[]>(
    () => [{ id: "init", slide, visible: true }]
  );
  const prevKey = useRef<string>(slide?.id ?? "none");

  useEffect(() => {
    const key = slide?.id ?? "none";
    if (key === prevKey.current) return;
    prevKey.current = key;
    if (durationMs <= 0) {
      setLayers([{ id: key + ":" + Date.now(), slide, visible: true }]);
      return;
    }
    // Add the new layer on top, then fade out the old one.
    setLayers((prev) => {
      const next = prev.map((l) => ({ ...l, visible: false }));
      next.push({ id: key + ":" + Date.now(), slide, visible: false });
      return next;
    });
    // Trigger fade-in on the next frame so the transition runs.
    const raf = requestAnimationFrame(() => {
      setLayers((prev) => prev.map((l, i) => (i === prev.length - 1 ? { ...l, visible: true } : l)));
    });
    const cleanup = setTimeout(() => {
      setLayers((prev) => prev.slice(-1));
    }, durationMs + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(cleanup);
    };
  }, [slide, durationMs]);

  return (
    <div className={`relative ${variant === "stage" ? "h-full" : "aspect-video"} w-full ${className}`}>
      {layers.map((l) => (
        <div
          key={l.id}
          className="absolute inset-0"
          style={{
            opacity: l.visible ? 1 : 0,
            transition: durationMs > 0 ? `opacity ${durationMs}ms ease-in-out` : undefined,
          }}
        >
          <SlideView slide={l.slide} variant={variant} imageFit={imageFit} className="h-full w-full" />
        </div>
      ))}
    </div>
  );
}
