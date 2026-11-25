import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { PhoneTab } from "@/lib/phone-layout";
import { currentHasEntryBehind, currentStepBackHref, entryIndex } from "@/lib/back-trail";

const BACK_CLASS =
  "mono flex w-fit items-center gap-1.5 text-xs uppercase tracking-wider transition-opacity hover:opacity-60";

/** Steps back in history, unless there is nothing behind (a fresh tab). */
function stepBack(e: React.MouseEvent) {
  if (window.history.length > 1) {
    e.preventDefault();
    window.history.back();
  }
}

/** The plain mono "Back" at the top left of About, Updates, Terms, Privacy,
 *  Transparency, Feedback, Donate and the phone Intro. One look everywhere;
 *  pages place it with `BACK_PAGE_TOP` (lib/page-top.ts). `tone` sets the
 *  colour and strength for the page's background.
 *
 *  Opened from another of those pages or the Intro, Back steps back to it
 *  (lib/back-trail.ts). Otherwise `toLogin` returns to the sign-in page (Terms
 *  and Privacy opened from it), and everything else goes home (`search`: the
 *  phone's Settings tab when opened from there).
 *
 *  `freshLabel` (Subscribe: "Home"): the label when the page was opened from
 *  a link from elsewhere rather than from within phyto, where it reads Back. */
export function BackLink({
  search,
  tone = "opacity-80",
  toLogin = false,
  freshLabel,
}: {
  search?: { tab?: PhoneTab };
  tone?: string;
  toLogin?: boolean;
  freshLabel?: string;
}) {
  // Read after mount: history and sessionStorage don't exist on the server.
  const href = useLocation({ select: (l) => l.href });
  const index = useLocation({ select: (l) => entryIndex(l.state) });
  const [behind, setBehind] = useState<string | null>(null);
  useEffect(() => setBehind(currentStepBackHref(index, href)), [index, href]);
  // Opened from a link (nothing of ours behind it): null until read.
  const [fresh, setFresh] = useState<boolean | null>(freshLabel ? null : false);
  useEffect(() => {
    if (freshLabel) setFresh(!currentHasEntryBehind(index));
  }, [freshLabel, index]);

  if (behind) {
    return (
      <a href={behind} onClick={stepBack} className={`${BACK_CLASS} ${tone}`}>
        <ArrowLeft className="h-3 w-3" /> BACK
      </a>
    );
  }
  if (toLogin) {
    // Step back in history (the sign-in page pushed this page), rather than
    // pushing the sign-in page again: otherwise its Cancel (also a step
    // back) would land on Terms instead of where sign in was opened from.
    return (
      <Link to="/login" onClick={stepBack} className={`${BACK_CLASS} ${tone}`}>
        <ArrowLeft className="h-3 w-3" /> BACK
      </Link>
    );
  }
  return (
    <Link
      to="/"
      search={search ?? {}}
      className={`${BACK_CLASS} ${tone} ${fresh === null ? "invisible" : ""}`}
    >
      <ArrowLeft className="h-3 w-3" /> {fresh && freshLabel ? freshLabel.toUpperCase() : "BACK"}
    </Link>
  );
}
