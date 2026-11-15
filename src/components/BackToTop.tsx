import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Back to top for long pages (About, Intro, Updates, Legal, Transparency): a
 * round button that fades in at the bottom right once the page has scrolled
 * past 200px, the same as the gathering's slide stack. Fixed to the window,
 * so where it sits in the page doesn't matter; use one per page.
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = () => setShown(window.scrollY > 200);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 1, behavior: "smooth" })}
      className={`pill fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] right-4 z-40 flex h-11 w-11 items-center justify-center border border-foreground bg-background text-foreground transition-all duration-300 active:opacity-80 ${
        shown ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
      title="Back to top"
      aria-label="Back to top"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
