import { createFileRoute } from "@tanstack/react-router";
import { useLibrary, useLive, useSongTemplateDraft, useScriptureTemplateDraft } from "@/lib/store";
import { DissolveSlide } from "@/components/SlideView";
import { useEffect, useMemo, useRef } from "react";
import type { Slide } from "@/lib/types";

export const Route = createFileRoute("/output")({
  head: () => ({
    meta: [
      { title: "Stage Output | phyto" },
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
          className="h-full w-full"
        />
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
