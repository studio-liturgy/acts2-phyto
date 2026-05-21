import { ArrowUp } from "lucide-react";

export function BackToTop() {
  const scrollToTop = () => {
    window.scrollTo({ top: 1, behavior: "smooth" });
  };

  return (
    <button
      onClick={scrollToTop}
      className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-70 transition-opacity hover:opacity-100"
      aria-label="Back to top"
    >
      <ArrowUp className="h-3 w-3" /> Back to top
    </button>
  );
}
