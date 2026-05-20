import { createFileRoute } from "@tanstack/react-router";
import { useLibrary, useLive } from "@/lib/store";
import { SlideView } from "@/components/SlideView";
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
  const slide = useMemo(
    () => deck?.slides.find((s) => s.id === live.slideId) ?? null,
    [deck, live.slideId]
  );

  // Hide scrollbars / background — this is the projection surface
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "black";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      {live.blackout || live.clear || !slide ? (
        <div className="h-full w-full bg-black" />
      ) : (
        <div className="h-full w-full">
          <SlideView slide={slide} variant="stage" className="h-full w-full aspect-auto" />
        </div>
      )}
    </div>
  );
}
