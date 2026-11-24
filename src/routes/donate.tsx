import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import { BackLink } from "@/components/BackLink";
import { BACK_PAGE_TOP } from "@/lib/page-top";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";
import { useBackHomeSearch } from "@/hooks/use-back-home";
import { isNativeApp } from "@/lib/native-app";
import { APP_NAME } from "@/lib/appConfig";

const STRIPE_DONATE_URL = "https://donate.stripe.com/bJe14gbwwbucdfac9E8og00";

const CONTACT_SUBJECT = "Donating to phyto";
const CONTACT_BODY =
  "I would like to donate to phyto by [Wise / e-transfer / recurring donation]. Could you please send me the details?";
const CONTACT_MAILTO = `mailto:hello@studioliturgy.com?subject=${encodeURIComponent(
  CONTACT_SUBJECT,
)}&body=${encodeURIComponent(CONTACT_BODY)}`;

/** Present's big pill with its arrow, in About's white-on-blue. */
const PILL =
  "pill flex items-center gap-3 border border-[var(--brand-white)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]";

export const Route = createFileRoute("/donate")({
  head: () => ({
    meta: [{ title: `Donate | ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: DonatePage,
});

function DonatePage() {
  const navigate = useNavigate();
  // Opened from the phone's Settings tab: Back returns there.
  const backSearch = useBackHomeSearch();
  usePageBackgroundColor("var(--brand-blue)");
  // Giving stays out of the phyto app (store payment rules): the page is
  // hidden there before paint ([data-giving], styles.css) and goes home.
  useEffect(() => {
    if (isNativeApp()) navigate({ to: "/", replace: true });
  }, [navigate]);

  return (
    <div
      data-giving
      className="flex min-h-dvh flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]"
    >
      <header className={`mx-auto w-full max-w-6xl px-6 ${BACK_PAGE_TOP}`}>
        <BackLink search={backSearch} tone="opacity-90" />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <h1 className="text-3xl leading-snug tracking-[-0.045em] md:text-[2.6rem] md:leading-[1.15]">
          Thank you for considering donating!
        </h1>
        <div className="mono mt-10 max-w-2xl space-y-1 text-xs uppercase leading-relaxed md:text-sm">
          <p>To give with standard credit cards, please select Stripe.</p>
          <p>
            To give via Wise, e-transfer or to set up recurring donations, please contact me through
            the button on the right.
          </p>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <a href={STRIPE_DONATE_URL} target="_blank" rel="noopener noreferrer" className={PILL}>
            Stripe <ArrowUpRight className="size-[1em]" />
          </a>
          <a href={CONTACT_MAILTO} target="_blank" rel="noopener noreferrer" className={PILL}>
            Contact <ArrowUpRight className="size-[1em]" />
          </a>
        </div>
        <Link
          to="/transparency"
          search={{ from: "donate" }}
          className="mono mt-10 text-xs uppercase tracking-wider underline underline-offset-4 transition-opacity hover:opacity-60"
        >
          See where your money goes
        </Link>
      </main>
    </div>
  );
}
