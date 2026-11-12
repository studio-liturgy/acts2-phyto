import { useEffect } from "react";
import { preloadImage } from "@/lib/media-preload";

/** Fetch and decode these pictures now (Stage Output, the screen link), so
 *  slides that show them later paint at once. */
export function usePreloadImages(urls: string[]) {
  const key = urls.join("\n");
  useEffect(() => {
    for (const u of urls) void preloadImage(u);
    // `key` stands for the list's content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
