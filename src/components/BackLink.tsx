import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { PhoneTab } from "@/lib/phone-layout";

const BACK_CLASS =
  "mono flex w-fit items-center gap-1.5 text-xs uppercase tracking-wider transition-opacity hover:opacity-60";

/** The plain mono "Back" at the top left of About, Updates, Terms, Privacy,
 *  Transparency, Feedback and the phone Intro. One look everywhere; pages
 *  place it with `BACK_PAGE_TOP` (lib/page-top.ts). `tone` sets the colour and
 *  strength for the page's background. `toLogin` returns to the sign-in page
 *  (Terms and Privacy opened from it). */
export function BackLink({
  search,
  tone = "opacity-80",
  toLogin = false,
}: {
  search?: { tab?: PhoneTab };
  tone?: string;
  toLogin?: boolean;
}) {
  if (toLogin) {
    // Step back in history (the sign-in page pushed this page), rather than
    // pushing the sign-in page again: otherwise its Cancel (also a step
    // back) would land on Terms instead of where sign in was opened from.
    return (
      <Link
        to="/login"
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
