import { useEffect } from "react";

/**
 * Temporarily paints a background onto the document root (`<html>`) while the
 * calling component is mounted, restoring the previous value on unmount.
 *
 * Used so full-screen pages cover the device's safe-area / overscroll zones on
 * mobile, instead of revealing the cream page background ("white bars").
 *
 * Pass a CSS `background` shorthand (e.g. a color, or `url(...) center/cover`),
 * or `false` to do nothing.
 */
export function useRootBackground(background: string | false) {
  useEffect(() => {
    if (!background) return;
    const root = document.documentElement;
    const prev = root.style.background;
    root.style.background = background;
    return () => {
      root.style.background = prev;
    };
  }, [background]);
}
