import type { Slide, SetTemplate } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

interface Props {
  slide?: Slide | null;
  /** "stage" = fullscreen output, "preview" = editor preview, "thumb" = small card. */
  variant?: "stage" | "thumb" | "preview";
  className?: string;
  /** Background-size for image slides. Defaults to "contain" so vertical images aren't cropped. */
  imageFit?: "contain" | "cover";
  /** Visual template (font size/family/background) from the parent set. */
  template?: SetTemplate;
  /** Video playback command from live state. Only acted on by variant="stage". */
  videoCmd?: { action: "play" | "pause" | "restart"; nonce: number };
  /** Called (stage only) when the current video reaches its end. */
  onVideoEnded?: () => void;
  /**
   * Whether this slide is the currently-live one. The dissolve keeps the
   * outgoing slide mounted in a back layer; marking it inactive lets a video
   * reset (stop + rewind to its poster) so returning to it starts fresh.
   * Defaults to true.
   */
  active?: boolean;
  /**
   * Whether video playback is permitted in this document. The output window is
   * a separate tab; browsers block programmatic play() until that document has
   * received a user gesture. The output gates this on a one-time "arm" click.
   * Defaults to true (editor/presenter previews don't play anyway).
   */
  playbackEnabled?: boolean;
}

/** YouTube thumbnail URL for a video id. */
function youtubePoster(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Renders a video slide. On the stage (output) it reacts to `videoCmd` to
 * play/pause; thumb/preview variants show a static poster and never play.
 * YouTube uses the privacy-friendly youtube-nocookie embed.
 */
const YT_ORIGIN = "https://www.youtube-nocookie.com";

function VideoLayer({
  slide,
  variant,
  videoCmd,
  onEnded,
  active = true,
  playbackEnabled = true,
}: {
  slide: Slide;
  variant: "stage" | "thumb" | "preview";
  videoCmd?: { action: "play" | "pause" | "restart"; nonce: number };
  onEnded?: () => void;
  active?: boolean;
  playbackEnabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isStage = variant === "stage";
  const action = videoCmd?.action;
  const playing = isStage && active && (action === "play" || action === "restart");
  // Once playback starts we keep the YouTube iframe mounted so pause/resume
  // doesn't restart the video from the beginning.
  const [ytStarted, setYtStarted] = useState(false);

  // Drive the <video> element from the playback command. When this slide is no
  // longer live, stop and rewind so returning to it shows the poster again.
  useEffect(() => {
    if (!isStage) return;
    const el = videoRef.current;
    if (!el) return;
    if (!active) {
      el.pause();
      el.currentTime = 0;
      return;
    }
    if (!playbackEnabled) return;
    if (action === "play") el.play().catch(() => {});
    else if (action === "pause") el.pause();
    else if (action === "restart") {
      el.currentTime = 0;
      el.play().catch(() => {});
    }
  }, [isStage, active, playbackEnabled, action, videoCmd?.nonce]);

  // Mount the YouTube iframe on first play; unmount it (back to the poster)
  // once this slide is no longer the live one so it resets for next time.
  useEffect(() => {
    if (!isStage || slide.videoSource !== "youtube") return;
    if (!active) {
      setYtStarted(false);
      return;
    }
    if (playbackEnabled && (action === "play" || action === "restart")) setYtStarted(true);
  }, [isStage, slide.videoSource, active, playbackEnabled, action, videoCmd?.nonce]);

  // Drive the YouTube iframe via the postMessage API once it has started.
  // The player's JS API is not ready the instant the iframe mounts, so a
  // single command is often dropped — retry play/restart until the player
  // reports it is actually playing (onStateChange info === 1).
  useEffect(() => {
    if (!isStage || slide.videoSource !== "youtube" || !ytStarted || !active) return;
    const send = (func: string, args: unknown[] = []) =>
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args }),
        YT_ORIGIN,
      );
    let started = false;
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== YT_ORIGIN) return;
      try {
        const d = JSON.parse(ev.data);
        // info 1 = playing, 2 = paused — either means the API is now live.
        if (d?.event === "onStateChange" && (d.info === 1 || d.info === 2)) started = true;
      } catch {
        // non-JSON message — ignore
      }
    };
    window.addEventListener("message", onMsg);
    // `first` carries the one-time seek for a restart. Retries only re-send
    // playVideo — re-seeking on every tick would yank the video back to 0
    // repeatedly until the "playing" signal arrives, glitching the first
    // half-second.
    const dispatch = (first: boolean) => {
      send("addEventListener", ["onStateChange"]);
      if (action === "restart" && first) send("seekTo", [0, true]);
      if (action === "play" || action === "restart") send("playVideo");
      else if (action === "pause") send("pauseVideo");
    };
    dispatch(true);
    let timer: ReturnType<typeof setInterval> | undefined;
    if (action === "play" || action === "restart") {
      let tries = 0;
      timer = setInterval(() => {
        if (started || ++tries > 25) {
          if (timer) clearInterval(timer);
          return;
        }
        dispatch(false);
      }, 200);
    }
    return () => {
      window.removeEventListener("message", onMsg);
      if (timer) clearInterval(timer);
    };
  }, [isStage, slide.videoSource, action, videoCmd?.nonce, ytStarted, active]);

  // Detect end-of-video from the YouTube iframe (state 0 = ended).
  useEffect(() => {
    if (!isStage || slide.videoSource !== "youtube" || !onEnded || !active) return;
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== YT_ORIGIN) return;
      try {
        const d = JSON.parse(ev.data);
        if (d?.event === "onStateChange" && d.info === 0) onEnded();
      } catch {
        // non-JSON message from the iframe — ignore
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [isStage, slide.videoSource, onEnded, active]);

  if (slide.videoSource === "youtube" && slide.youtubeId) {
    const id = slide.youtubeId;
    if (isStage && ytStarted) {
      const src =
        `https://www.youtube-nocookie.com/embed/${id}` +
        `?enablejsapi=1&autoplay=1&rel=0&modestbranding=1&playsinline=1&controls=1`;
      return (
        <iframe
          ref={iframeRef}
          className="absolute inset-0 h-full w-full border-0"
          src={src}
          title={slide.title ?? "Video"}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          onLoad={() =>
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"] }),
              YT_ORIGIN,
            )
          }
        />
      );
    }
    // Idle / thumb / preview: poster with a play affordance.
    return (
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${youtubePoster(id)})` }}
      >
        <PlayGlyph />
      </div>
    );
  }

  // file / url → native <video>
  if (slide.videoUrl) {
    return (
      <>
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full bg-black object-contain"
          src={slide.videoUrl}
          playsInline
          preload="metadata"
          controls={isStage}
          onEnded={isStage ? onEnded : undefined}
        />
        {!playing && <PlayGlyph />}
      </>
    );
  }

  return <div className="absolute inset-0 bg-black" />;
}

function PlayGlyph() {
  // Size scales with the container (so a small preview box gets a small glyph)
  // but caps near the original stage size so full-screen output is unchanged.
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="flex aspect-square w-[15%] min-w-8 max-w-24 items-center justify-center rounded-full bg-black/55 text-white">
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
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
  videoCmd,
  onVideoEnded,
  active = true,
  playbackEnabled = true,
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
  const alignClass = template?.align === "left" ? "items-start text-left" : "items-center text-center";
  const refAbove = template?.referencePosition === "above";

  if (slide?.kind === "video") {
    return (
      <div className={`relative ${aspect} w-full overflow-hidden bg-black ${className}`}>
        <VideoLayer slide={slide} variant={variant} videoCmd={videoCmd} onEnded={onVideoEnded} active={active} playbackEnabled={playbackEnabled} />
      </div>
    );
  }

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
        <div className={`relative flex h-full w-full flex-col justify-center px-24 py-20 ${alignClass}`}>
          {slide?.title && (
            <div
              className="mb-10 font-semibold leading-tight"
              style={{ fontSize: `${4.5 * fontScale}rem` }}
            >
              {slide.title}
            </div>
          )}
          {slide?.reference && slide.kind === "scripture" && refAbove && (
            <div
              className="mb-12 opacity-80"
              style={{ fontSize: `${1.875 * fontScale}rem` }}
            >
              {slide.reference}
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
          {slide?.reference && slide.kind === "scripture" && !refAbove && (
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
  videoCmd,
  onVideoEnded,
  playbackEnabled = true,
}: Props & { durationMs?: number }) {
  const [a, setA] = useState<Slide | null | undefined>(slide);
  const [b, setB] = useState<Slide | null | undefined>(null);
  const [templateA, setTemplateA] = useState<Props["template"]>(template);
  const [templateB, setTemplateB] = useState<Props["template"]>(undefined);
  const [front, setFront] = useState<"a" | "b">("a");
  const lastKey = useRef<string>(slide?.id ?? "none");
  const templateRef = useRef(template);
  templateRef.current = template;

  useEffect(() => {
    const key = slide?.id ?? "none";
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (durationMs <= 0) {
      if (front === "a") { setA(slide); setTemplateA(templateRef.current); }
      else { setB(slide); setTemplateB(templateRef.current); }
      return;
    }

    if (front === "a") {
      setB(slide);
      setTemplateB(templateRef.current);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setFront("b"))
      );
    } else {
      setA(slide);
      setTemplateA(templateRef.current);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setFront("a"))
      );
    }
  }, [slide, durationMs, front]);

  // Outgoing layer fades out on top (zIndex 2); incoming layer snaps to full
  // opacity below (zIndex 1). Total opacity is always 1 — no dip-to-black on
  // light backgrounds, and the transition is symmetric for both directions.
  const layerStyle = (isFront: boolean): React.CSSProperties =>
    isFront
      ? { opacity: 1, zIndex: 1 }
      : {
          opacity: 0,
          zIndex: 2,
          transition: durationMs > 0 ? `opacity ${durationMs}ms ease-in-out` : undefined,
        };

  return (
    <div
      className={`relative isolate ${variant === "stage" ? "h-full" : "aspect-video"} w-full ${className}`}
    >
      <div className="absolute inset-0" style={layerStyle(front === "a")}>
        <SlideView slide={a} variant={variant} imageFit={imageFit} template={templateA} videoCmd={videoCmd} onVideoEnded={onVideoEnded} active={front === "a"} playbackEnabled={playbackEnabled} className="h-full w-full" />
      </div>
      <div className="absolute inset-0" style={layerStyle(front === "b")}>
        <SlideView slide={b} variant={variant} imageFit={imageFit} template={templateB} videoCmd={videoCmd} onVideoEnded={onVideoEnded} active={front === "b"} playbackEnabled={playbackEnabled} className="h-full w-full" />
      </div>
    </div>
  );
}
