import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { PhoneTab } from "@/lib/phone-layout";

const BACK_CLASS =
  "mono flex w-fit items-center gap-1.5 text-xs uppercase tracking-wider transition-opacity hover:opacity-60";

/** The plain mono "Back" at the top left of About, Updates, Terms, Privacy,
 *  Transparency, Feedback and the phone Intro. One look everywhere; pages
 *  place it with `BACK_PAGE_TOP` (lib/page-top.ts). `tone` sets the colour and
 *  strength for the page's background. `toLogin` returns to the sign-in page
 *  (Terms and Privacy opened from it); `toDonate` returns to Donate
 *  (Transparency opened from it). */
export function BackLink({
  search,
  tone = "opacity-80",
  toLogin = false,
  toDonate = false,
}: {
  search?: { tab?: PhoneTab };
  tone?: string;
  toLogin?: boolean;
  toDonate?: boolean;
}) {
  if (toLogin || toDonate) {
    // Step back in history (the page that opened this one pushed it), rather
    // than pushing that page again: otherwise its own Back (sign in's Cancel
    // is a step back too) would land here instead of where it was opened from.
    return (
      <Link
        to={toLogin ? "/login" : "/donate"}
        onClick={(e) => {
          if (window.history.length > 1) {
            e.preventDefault();
            window.history.back();
          }
        }}
        className={`${BACK_CLASS} ${tone}`}
      >
        <ArrowLeft className="h-3 w-3" /> BACK
      </Link>
    );
  }
  return (
    <Link to="/" search={search ?? {}} className={`${BACK_CLASS} ${tone}`}>
      <ArrowLeft className="h-3 w-3" /> BACK
    </Link>
  );
}
