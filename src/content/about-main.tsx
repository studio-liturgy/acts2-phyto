import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";
import { useBackHomeSearch } from "@/hooks/use-back-home";
import { useImageReady } from "@/hooks/use-image-ready";
import aboutBg from "@/assets/about-bg.jpg";

/** The picture's average colour, shown until the picture is ready. */
const ABOUT_BG_FILL = "#307193";

export default function AboutMain() {
  // Opened from the phone's Settings tab: Back returns there.
  const backSearch = useBackHomeSearch();
  usePageBackgroundColor("#3c7a9e");
  const bgReady = useImageReady(aboutBg);
  return (
    <div className="flex flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <section className="relative flex-1 w-full" style={{ backgroundColor: ABOUT_BG_FILL }}>
        {/* The picture appears whole, never painting in strips: hidden until
            decoded (at once when it's already cached, else a short fade). */}
        <div
          aria-hidden
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat ${
            bgReady === "instant" ? "" : "transition-opacity duration-300"
          } ${bgReady ? "opacity-100" : "opacity-0"}`}
          style={{ backgroundImage: `url('${aboutBg}')` }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-6 pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] pb-24 md:pt-14 md:pb-32">
          <Link
            to="/"
            search={backSearch}
            className="mono inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--brand-white)] opacity-90 transition-opacity hover:opacity-60"
          >
            <ArrowLeft className="h-3 w-3" /> BACK
          </Link>
          <h1 className="sr-only">What is phyto?</h1>

          {/* Large intro */}
          <div className="mt-10 max-w-5xl space-y-10 text-3xl md:text-[2.6rem] md:leading-[1.15] leading-snug">
            <p>
              phyto is a free, open source presentation tool built for small home worship
              gatherings.
            </p>
            <p>
              I started building this to serve my local church. But maybe it could bless more
              people?
            </p>
          </div>

          {/* Body paragraphs — placed lower per design */}
          <div className="mt-[28rem] max-w-5xl space-y-6 text-sm md:text-[0.95rem] leading-relaxed">
            <p>
              For more than five years I worked as the "creative / production guy" at a church in
              downtown Vancouver. Then God led me to a small house church community. No gear, no
              budget. Just an acoustic guitar, a cheap piano, and sometimes a TV or projector on the
              wall. What I noticed was that our pastor was dealing with slides last minute, while
              also keeping an eye on his kids and welcoming people through the door. I wanted to
              make this process just a little easier.
            </p>
            <p>
              As I built it, I started to see who else it could bless: the underground church,
              voluntary pastors with no budget for software, impromptu home gatherings that just
              need something simple and focused. So I've kept it completely free for anyone to use.
              I'll keep maintaining and improving it as I'm able. If you'd like to{" "}
              <span data-giving>donate (only cheerfully!) or </span>share testimonies, bug reports,
              feedback, or feature requests, I'd love to hear from you.
            </p>
          </div>

          {/* Buttons */}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              to="/donate"
              data-giving
              className="pill flex items-center border border-[var(--brand-white)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
            >
              Donate
            </Link>
            <Link
              to="/transparency"
              className="pill flex items-center border border-[var(--brand-white)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
            >
              Transparency
            </Link>
            <Link
              to="/feedback"
              className="pill flex items-center border border-[var(--brand-white)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
            >
              Feedback
            </Link>
          </div>

          {/* Mono footnote */}
          <p className="mono mt-20 max-w-4xl text-xs uppercase leading-relaxed text-[var(--brand-white)]">
            phyto is the Greek prefix for plants. Organisms that freely receive, freely give away
            and grow over time. Our times of worship together should work the same way.
          </p>
          <BackToTop arrow="var(--brand-blue)" />
        </div>
      </section>

      <Footer className="mt-0" />
    </div>
  );
}
