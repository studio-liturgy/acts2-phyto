import { useLayoutEffect, useRef, useState } from "react";
import launchBg from "@/assets/launch-bg.jpg";
import wordmark from "@/assets/wordmark.svg";
import { haptic } from "@/lib/haptics";
import {
  BLOCK_STEPS,
  FADE_AT,
  FADE_MS,
  LAUNCH_END,
  LAUNCH_PLAYED_KEY,
  LOGO_AT,
  blocksAcross,
  blocksDown,
  coverCrop,
  grainAt,
} from "@/lib/launch-reveal";

/** Grain at full strength (overlay blend opacity). */
const GRAIN_MAX = 0.15;
/** Give up waiting for the picture after this long. */
const LOAD_TIMEOUT = 3000;
/** The picture's average colour, shown until the first frame draws. */
const FILL = "#2e7092";

/**
 * The phyto app's launch animation, played once per launch over the first
 * screen (lib/launch-reveal.ts holds the timeline). It takes over from the
 * native launch screen (plain blue, the picture's average colour), so `onFirstFrame` hides
 * that only once the first frame has drawn. Taps don't skip it.
 */
export function LaunchReveal({
  onFirstFrame,
  onDone,
}: {
  onFirstFrame: () => void;
  onDone: () => void;
}) {
  const picRef = useRef<HTMLCanvasElement>(null);
  const grainRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"blocks" | "logo" | "fade">("blocks");
  const [still, setStill] = useState(false);

  useLayoutEffect(() => {
    let alive = true;
    let raf = 0;
    const timers: number[] = [];
    let started = false;
    try {
      sessionStorage.setItem(LAUNCH_PLAYED_KEY, "1");
    } catch {
      // Private mode: it may play again on a reload, which is harmless.
    }

    const finish = () => {
      if (!alive) return;
      onFirstFrame();
      onDone();
    };

    const start = (img: HTMLImageElement) => {
      const pic = picRef.current;
      const grain = grainRef.current;
      if (!alive || started || !pic || !grain) return;
      started = true;
      const ctx = pic.getContext("2d");
      const gctx = grain.getContext("2d");
      if (!ctx || !gctx || !img.naturalWidth) return finish();
      const W = window.innerWidth;
      const H = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      pic.width = Math.round(W * dpr);
      pic.height = Math.round(H * dpr);
      const crop = coverCrop(img.naturalWidth, img.naturalHeight, W, H);
      const small = document.createElement("canvas");
      const sctx = small.getContext("2d");
      if (!sctx) return finish();
      let drawn = 0;
      const draw = (across: number) => {
        if (across === drawn) return;
        // A light tick each time the blocks halve (not on the first frame).
        if (drawn !== 0) haptic("tap");
        drawn = across;
        const down = blocksDown(across, W, H);
        small.width = across;
        small.height = down;
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = "high";
        sctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, across, down);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, across, down, 0, 0, pic.width, pic.height);
      };

      // Still grain: one sheet of random grey, made stronger by opacity.
      const gdpr = Math.min(dpr, 2);
      grain.width = Math.round(W * gdpr);
      grain.height = Math.round(H * gdpr);
      const noise = gctx.createImageData(grain.width, grain.height);
      const d = noise.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
      gctx.putImageData(noise, 0, 0);

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        // Reduce Motion: the finished frame, held, then the fade.
        draw(BLOCK_STEPS[BLOCK_STEPS.length - 1].across);
        grain.style.opacity = String(GRAIN_MAX);
        setStill(true);
        setPhase("logo");
      } else {
        draw(BLOCK_STEPS[0].across);
        grain.style.opacity = "0";
      }

      // Hide the native launch screen once this frame is on screen.
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          if (!alive) return;
          onFirstFrame();
          // The clock starts at once, while the native launch screen (the
          // same blue) is still fading out over it: waiting for that fade
          // first held the plain blue too long.
          const t0 = performance.now();
          if (!reduce) {
            const tick = (now: number) => {
              if (!alive) return;
              const t = Math.max(0, now - t0);
              draw(blocksAcross(t));
              grain.style.opacity = String(grainAt(t) * GRAIN_MAX);
              if (t < LOGO_AT) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
            timers.push(window.setTimeout(() => alive && setPhase("logo"), LOGO_AT));
          }
          timers.push(window.setTimeout(() => alive && setPhase("fade"), FADE_AT));
          timers.push(window.setTimeout(() => alive && onDone(), LAUNCH_END));
        });
      });
    };

    const img = new Image();
    img.src = launchBg;
    timers.push(window.setTimeout(finish, LOAD_TIMEOUT));
    img.decode().then(
      () => {
        if (started) return;
        window.clearTimeout(timers.shift());
        start(img);
      },
      () => {
        if (!started) finish();
      },
    );

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      for (const id of timers) window.clearTimeout(id);
    };
    // Runs once per mount; the callbacks come from the root and stay put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[1000] overflow-hidden"
      style={{
        backgroundColor: FILL,
        opacity: phase === "fade" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
      }}
    >
      <canvas ref={picRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={grainRef}
        className="absolute inset-0 h-full w-full mix-blend-overlay"
        style={{ opacity: 0 }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src={wordmark}
          alt=""
          className={`w-60 lg:w-80 ${
            phase === "blocks" ? "opacity-0" : still ? "" : "animate-launch-burst"
          }`}
        />
      </div>
    </div>
  );
}
