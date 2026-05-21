import { createFileRoute } from "@tanstack/react-router";
import { useLibrary, useLive, useSongTemplateDraft } from "@/lib/store";
import { SlideView, DissolveSlide } from "@/components/SlideView";
import { useEffect, useMemo } from "react";

export const Route = createFileRoute("/output")({
  head: () => ({
    meta: [
      { title: "Stage — Output" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Output,
});

function Output() {
  const live = useLive();
  const deck = useLibrary((s) => (live.deckId ? s.decks[live.deckId] : null));
  const songTemplate = useLibrary((s) => s.songTemplate);
  const slide = useMemo(
    () => deck?.slides.find((s) => s.id === live.slideId) ?? null,
    [deck, live.slideId]
  );
  const template = deck?.kind === "song" ? songTemplate : deck?.template;

  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "black";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  const isMedia = deck?.kind === "media";
  const fadeMs = live.blackoutFadeMs ?? 0;
  const hideContent = live.clear || !slide;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      {hideContent ? (
        <div className="h-full w-full bg-black" />
      ) : isMedia ? (
        <DissolveSlide
          slide={slide}
          variant="stage"
          durationMs={deck?.dissolveMs ?? 0}
          template={template}
          className="h-full w-full"
        />
      ) : (
        <SlideView slide={slide} variant="stage" template={template} className="h-full w-full" />
      )}
      {/* Blackout overlay — fades in/out when blackoutFadeMs > 0. */}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{
          opacity: live.blackout ? 1 : 0,
          transition: fadeMs > 0 ? `opacity ${fadeMs}ms ease-in-out` : undefined,
        }}
      />
    </div>
  );
}
