import { createFileRoute } from "@tanstack/react-router";
import { useLibrary, useLive, useSongTemplateDraft, useScriptureTemplateDraft } from "@/lib/store";
import { DissolveSlide } from "@/components/SlideView";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Slide } from "@/lib/types";
import { APP_NAME } from "@/lib/appConfig";

const ARMED_KEY = "phyto-video-armed";

export const Route = createFileRoute("/output")({
  head: () => ({
    meta: [
      { title: `Stage Output | ${APP_NAME}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Output,
});

function Output() {
  const live = useLive();
  const phytoSet = useLibrary((s) => (live.setId ? s.sets[live.setId] : null));
  const songTemplate = useLibrary((s) => s.songTemplate);
  const songDraft = useSongTemplateDraft((s) => s.draft);
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const scriptureDraft = useScriptureTemplateDraft((s) => s.draft);
  const rawSlide = useMemo(
    () => phytoSet?.slides.find((s) => s.id === live.slideId) ?? null,
    [phytoSet, live.slideId]
  );
  const lastSlideRef = useRef<Slide | null>(null);
  if (rawSlide) lastSlideRef.current = rawSlide;
  const slide = rawSlide ?? (live.setId && live.slideId ? lastSlideRef.current : null);
  const template =
    phytoSet?.kind === "song" ? (songDraft ?? songTemplate)
    : phytoSet?.kind === "scripture" ? (scriptureDraft ?? scriptureTemplate)
    : phytoSet?.template;

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "black";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  const globalFadeMs = useLibrary((s) => s.fadeMs);
  const blackoutFadeMs = live.blackoutFadeMs ?? 0;
  const hideContent = live.clear || !slide;

  // Browsers block programmatic play() in this (separate) window until it has
  // received a user gesture. Arm once via a click; persist for the session.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(sessionStorage.getItem(ARMED_KEY) === "1");
  }, []);
  const arm = () => {
    sessionStorage.setItem(ARMED_KEY, "1");
    setArmed(true);
  };
  // Silently arm on the first interaction of any kind (clicking the window,
  // fullscreening it, a key press). In practice the operator always clicks the
  // output window while moving it to the projector, so the prompt below is a
  // rare fallback they'll only see if a video goes live before they've touched it.
  useEffect(() => {
    if (armed) return;
    const onGesture = () => arm();
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [armed]);
  // Only prompt while a video is actually on screen, so the overlay never
  // covers lyrics/scripture. Once armed it never shows again this session.
  const needsArm = !armed && !hideContent && slide?.kind === "video";

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      {hideContent ? (
        <div className="h-full w-full bg-black" />
      ) : (
        <DissolveSlide
          slide={slide}
          variant="stage"
          durationMs={globalFadeMs}
          template={template}
          videoCmd={live.videoCmd}
          onVideoEnded={() => live.videoFinished()}
          playbackEnabled={armed}
          className="h-full w-full"
        />
      )}
      {/* One-time gesture to satisfy the browser autoplay policy. */}
      {needsArm && (
        <button
          onClick={arm}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 text-white"
        >
          <span className="rounded-full border border-white/40 px-6 py-3 text-lg font-medium">
            Click to enable video playback
          </span>
        </button>
      )}
      {/* Blackout overlay — fades in/out when blackoutFadeMs > 0. */}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{
          opacity: live.blackout ? 1 : 0,
          transition: blackoutFadeMs > 0 ? `opacity ${blackoutFadeMs}ms ease-in-out` : undefined,
        }}
      />
    </div>
  );
}
