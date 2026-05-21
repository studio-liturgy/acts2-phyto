import type { Slide, DeckTemplate } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

interface Props {
  slide?: Slide | null;
  /** "stage" = fullscreen output, "preview" = editor preview, "thumb" = small card. */
  variant?: "stage" | "thumb" | "preview";
  className?: string;
  /** Background-size for image slides. Defaults to "contain" so vertical images aren't cropped. */
  imageFit?: "contain" | "cover";
  /** Visual template (font size/family/background) from the parent deck. */
  template?: DeckTemplate;
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
  template,
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

  const fontScale = template?.fontScale ?? 1;
  const bgMode = template?.bg ?? "black";
  const surfaceBg = bgMode === "white" ? "bg-white" : "bg-black";
  const surfaceText = bgMode === "white" ? "text-black" : "text-white";
  const placeholderText = bgMode === "white" ? "text-black/40" : "text-white/40";

  return (
    <div
      ref={wrapRef}
      className={`relative ${aspect} w-full overflow-hidden ${surfaceBg} ${surfaceText} ${className}`}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale})`,
          fontFamily: template?.fontFamily,
          ...bg,
        }}
      >
        {slide?.imageUrl && hasText ? <div className="absolute inset-0 bg-black/40" /> : null}
        <div className="relative flex h-full w-full flex-col items-center justify-center px-24 py-20 text-center">
          {slide?.title && (
            <div
              className="mb-10 font-semibold leading-tight"
              style={{ fontSize: `${4.5 * fontScale}rem` }}
            >
              {slide.title}
            </div>
          )}
          {slide?.lines?.map((l, i) => (
            <div
              key={i}
              className="font-medium leading-snug"
              style={{ fontSize: `${3.75 * fontScale}rem` }}
            >
              {l}
            </div>
          ))}
          {slide?.reference && slide.kind === "scripture" && (
            <div
              className="mt-12 opacity-80"
              style={{ fontSize: `${1.875 * fontScale}rem` }}
            >
              {slide.reference}
            </div>
          )}
          {!slide && (
            <div className={`text-3xl ${placeholderText}`}>No slide selected</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Cross-dissolves between slides using two persistent layers. The "front"
 * layer is always visible; on a slide change we paint the new slide into the
 * back layer and swap which is on top, animating the opacity over `durationMs`.
 */
export function DissolveSlide({
  slide,
  variant = "stage",
  durationMs = 0,
  className = "",
  imageFit,
  template,
}: Props & { durationMs?: number }) {
  const [a, setA] = useState<Slide | null | undefined>(slide);
  const [b, setB] = useState<Slide | null | undefined>(null);
  const [front, setFront] = useState<"a" | "b">("a");
  const lastKey = useRef<string>(slide?.id ?? "none");

  useEffect(() => {
    const key = slide?.id ?? "none";
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (durationMs <= 0) {
      if (front === "a") setA(slide);
      else setB(slide);
      return;
    }

    if (front === "a") {
      setB(slide);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setFront("b"))
      );
    } else {
      setA(slide);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setFront("a"))
      );
    }
  }, [slide, durationMs, front]);

  const layerStyle = (isFront: boolean): React.CSSProperties => ({
    opacity: isFront ? 1 : 0,
    transition: durationMs > 0 ? `opacity ${durationMs}ms ease-in-out` : undefined,
  });

  return (
    <div
      className={`relative ${variant === "stage" ? "h-full" : "aspect-video"} w-full ${className}`}
    >
      <div className="absolute inset-0" style={layerStyle(front === "a")}>
        <SlideView slide={a} variant={variant} imageFit={imageFit} template={template} className="h-full w-full" />
      </div>
      <div className="absolute inset-0" style={layerStyle(front === "b")}>
        <SlideView slide={b} variant={variant} imageFit={imageFit} template={template} className="h-full w-full" />
      </div>
    </div>
  );
}
