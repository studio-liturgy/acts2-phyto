import { Link } from "@tanstack/react-router";
import { BackLink } from "@/components/BackLink";
import { BACK_PAGE_TOP } from "@/lib/page-top";
import { useBackHomeSearch } from "@/hooks/use-back-home";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";
import loginBgOr from "@/assets/login-bg-or.jpg";

// Same picture as the test sign-in page.
const aboutBg = loginBgOr;

export default function AboutTest() {
  const backSearch = useBackHomeSearch();
  usePageBackgroundColor("#cf936f");
  return (
    <div className="flex flex-col bg-[var(--brand-orange)] text-[var(--brand-black)]">
      <section
        className="relative flex-1 w-full bg-[var(--brand-orange)]"
        style={{
          backgroundImage: `url(${aboutBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className={`mx-auto w-full max-w-6xl px-6 pb-24 md:pb-32 ${BACK_PAGE_TOP}`}>
          <BackLink search={backSearch} tone="text-[var(--brand-black)] opacity-90" />
          <h1 className="sr-only">What is phyto?</h1>

          {/* Large intro */}
          <div className="mt-10 max-w-5xl space-y-10 text-3xl md:text-[2.6rem] md:leading-[1.15] leading-snug">
            <p>
              phytoexp is an experimental public testing environment for phyto. Feel free to test
              upcoming features on this site and give feedback if you encounter any bugs!
            </p>
          </div>

          {/* Body subtext */}
          <p className="mt-6 max-w-4xl text-base leading-relaxed md:text-lg">
            Access a more stable version of phyto below.
          </p>

          {/* Buttons */}
          <div className="mt-[28rem] flex flex-wrap items-center gap-4">
            <a
              href="https://phyto.live"
              target="_blank"
              rel="noopener noreferrer"
              className="pill flex items-center border border-[var(--brand-black)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-black)] transition hover:bg-[var(--brand-black)] hover:text-[var(--brand-orange)]"
            >
              phyto.live
            </a>
            <Link
              to="/donate"
              data-giving
              className="pill flex items-center border border-[var(--brand-black)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-black)] transition hover:bg-[var(--brand-black)] hover:text-[var(--brand-orange)]"
            >
              Donate
            </Link>
            <Link
              to="/transparency"
              className="pill flex items-center border border-[var(--brand-black)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-black)] transition hover:bg-[var(--brand-black)] hover:text-[var(--brand-orange)]"
            >
              Transparency
            </Link>
            <Link
              to="/feedback"
              className="pill flex items-center border border-[var(--brand-black)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-black)] transition hover:bg-[var(--brand-black)] hover:text-[var(--brand-orange)]"
            >
              Feedback
            </Link>
          </div>

          {/* Mono footnote */}
          <p className="mono mt-20 max-w-4xl text-xs uppercase leading-relaxed text-[var(--brand-black)]">
            phyto is the Greek prefix for plants. Organisms that freely receive, freely give away
            and grow over time. Our times of worship together should work the same way.
          </p>
          <BackToTop arrow="var(--brand-orange)" />
        </div>
      </section>

      <Footer className="mt-0" />
    </div>
  );
}
