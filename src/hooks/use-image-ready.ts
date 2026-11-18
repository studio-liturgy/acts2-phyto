import { useLayoutEffect, useState } from "react";

/**
 * Whether a picture is ready to show whole: false until it has fully loaded
 * and decoded, then true; "instant" when it was already in the cache on the
 * first check (show it with no fade). Used for full-page backdrops (the sign-in
 * page) so a large picture never paints in visibly, strip by strip.
 */
export function useImageReady(src: string): false | true | "instant" {
  const [ready, setReady] = useState<false | true | "instant">(false);
  useLayoutEffect(() => {
    const img = new Image();
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      setReady("instant");
      return;
    }
    // A new picture (the sign-in page swaps to the app's after the first
    // render) waits for its own decode, whatever the last one did.
    setReady(false);
    let alive = true;
    const show = () => {
      if (alive) setReady(true);
    };
    // decode() waits for the whole picture; a failed load still shows the
    // page (the fill colour stays).
    img.decode().then(show, show);
    return () => {
      alive = false;
    };
  }, [src]);
  return ready;
}
