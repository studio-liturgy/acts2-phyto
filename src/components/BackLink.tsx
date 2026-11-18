import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { PhoneTab } from "@/lib/phone-layout";

/** The plain mono "Back" at the top left of About, Updates, Terms, Privacy,
 *  Transparency, Feedback and the phone Intro. One look everywhere; pages
 *  place it with `BACK_PAGE_TOP` (lib/page-top.ts). `tone` sets the colour and
 *  strength for the page's background. */
export function BackLink({
  search,
  tone = "opacity-80",
}: {
  search?: { tab?: PhoneTab };
  tone?: string;
}) {
  return (
    <Link
      to="/"
      search={search ?? {}}
      className={`mono flex w-fit items-center gap-1.5 text-xs uppercase tracking-wider transition-opacity hover:opacity-60 ${tone}`}
    >
      <ArrowLeft className="h-3 w-3" /> BACK
    </Link>
  );
}
