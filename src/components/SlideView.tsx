import type { Slide } from "@/lib/types";

interface Props {
  slide?: Slide | null;
  /** scale text relative to a 1920x1080 stage */
  variant?: "stage" | "thumb" | "preview";
  className?: string;
}

/**
 * Renders a slide at 16:9 aspect.
 * "stage" = fullscreen output, "preview" = editor preview, "thumb" = small card.
 */
export function SlideView({ slide, variant = "preview", className = "" }: Props) {
  const titleSize =
    variant === "stage" ? "text-6xl md:text-7xl" : variant === "preview" ? "text-3xl" : "text-xs";
  const bodySize =
    variant === "stage"
      ? "text-5xl md:text-6xl leading-tight"
      : variant === "preview"
      ? "text-2xl leading-snug"
      : "text-[10px] leading-tight";
  const refSize =
    variant === "stage" ? "text-2xl" : variant === "preview" ? "text-sm" : "text-[8px]";

  const bg = slide?.imageUrl
    ? { backgroundImage: `url(${slide.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : undefined;

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-black text-white ${className}`}
      style={bg}
    >
      {slide?.imageUrl && (slide.lines?.length || slide.title) ? (
        <div className="absolute inset-0 bg-black/40" />
      ) : null}
      <div className="relative flex h-full w-full flex-col items-center justify-center p-[5%] text-center">
        {slide?.title && <div className={`mb-4 font-semibold ${titleSize}`}>{slide.title}</div>}
        {slide?.lines?.map((l, i) => (
          <div key={i} className={`font-medium ${bodySize}`}>
            {l}
          </div>
        ))}
        {slide?.reference && (
          <div className={`mt-6 opacity-80 ${refSize}`}>{slide.reference}</div>
        )}
        {!slide && (
          <div className="text-white/40 text-sm">No slide selected</div>
        )}
      </div>
    </div>
  );
}
