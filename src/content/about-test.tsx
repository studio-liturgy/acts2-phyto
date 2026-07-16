import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";

const aboutBg = "/about-bg-or.jpg";

export default function AboutTest() {
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
        <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-24 md:pt-14 md:pb-32">
          <Link
            to="/"
            className="mono inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--brand-black)] opacity-90 transition-opacity hover:opacity-60"
          >
            <ArrowLeft className="h-3 w-3" /> BACK
          </Link>

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
            <a
              href="/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="pill flex items-center border border-[var(--brand-black)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-black)] transition hover:bg-[var(--brand-black)] hover:text-[var(--brand-orange)]"
            >
              Donate
            </a>
            <Link
              to="/feedback"
              className="pill flex items-center border border-[var(--brand-black)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-black)] transition hover:bg-[var(--brand-black)] hover:text-[var(--brand-orange)]"
            >
              Feedback
            </Link>
          </div>

          {/* Mono footnote */}
          <p className="mono mt-20 max-w-4xl text-xs uppercase leading-relaxed text-[var(--brand-black)]">
            phyto is short for phytoplankton. Organisms that use sunlight, freely available in
            abundance, to survive, live, and breathe. Our times of worship together should work the
            same way.
          </p>
          <div className="mt-12">
            <BackToTop />
          </div>
        </div>
      </section>

      <Footer className="mt-0" />
    </div>
  );
}
