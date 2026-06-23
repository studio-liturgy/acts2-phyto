import { useEffect } from "react";

/**
 * While the calling component is mounted, tints the mobile browser chrome and
 * overscroll region to match a full-screen page, so the cream page background
 * never shows as "white bars" in the iOS safe-area insets.
 *
 * Two purpose-built levers (a solid colour — never a background image, which
 * would size to the whole scrollable document and scroll independently):
 *   1. `<meta name="theme-color">` — iOS Safari uses this to tint the status
 *      bar and bottom toolbar.
 *   2. `background-color` on <html> + <body> — fills the overscroll rubber-band.
 *
 * Accepts any CSS colour, including a `var(--...)` reference (resolved to a
 * concrete value so it works in the meta tag and respects dark mode), or
 * `false` to do nothing. Everything is restored on unmount.
 */
export function usePageBackgroundColor(color: string | false) {
  useEffect(() => {
    if (!color) return;

    // Resolve var()/named colours to a concrete rgb() string.
    const probe = document.createElement("span");
    probe.style.color = color;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    if (!resolved) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    html.style.backgroundColor = resolved;
    body.style.backgroundColor = resolved;

    let meta = document.querySelector('meta[name="theme-color"]');
    const createdMeta = !meta;
    const prevMeta = meta?.getAttribute("content") ?? null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", resolved);

    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
      if (createdMeta) meta?.remove();
      else if (prevMeta !== null) meta?.setAttribute("content", prevMeta);
    };
  }, [color]);
}
