import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import aboutBg from "@/assets/about-bg.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — phyto" },
      { name: "description", content: "phyto is a free, open source presentation tool built for small worship gatherings." },
      { property: "og:title", content: "About — phyto" },
      { property: "og:description", content: "phyto is a free, open source presentation tool built for small worship gatherings." },
      { property: "og:url", content: "https://phyto.live/about" },
    ],
    links: [
      { rel: "canonical", href: "https://phyto.live/about" },
      { rel: "preload", as: "image", href: aboutBg },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <section
        className="relative w-full bg-[var(--brand-blue)]"
        style={{
          backgroundImage: `url(${aboutBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="mx-auto w-full max-w-6xl px-8 pt-10 pb-24 md:px-14 md:pt-14 md:pb-32">
          <Link
            to="/"
            className="mono inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--brand-white)] opacity-90 transition-opacity hover:opacity-60"
          >
            <ArrowLeft className="h-3 w-3" /> BACK
          </Link>

          {/* Large intro */}
          <div className="mt-10 max-w-5xl space-y-10 text-3xl md:text-[2.6rem] md:leading-[1.15] leading-snug">
            <p>
              phyto is a free, open source presentation tool built for small worship gatherings. Prepare your verses and lyrics beforehand, then run it live. Offline support is on the way.
            </p>
            <p>
              I built this to serve my local church. But God had more in mind.
            </p>
          </div>

          {/* Body paragraphs — placed lower per design */}
          <div className="mt-[28rem] max-w-5xl space-y-6 text-sm md:text-[0.95rem] leading-relaxed">
            <p>
              For more than five years I worked as the “creative / production guy” at a church in downtown Vancouver. Then God led me to Hong Kong, where I found myself in a small house church community. No gear, no budget. Just an acoustic guitar, a piano, and sometimes a cheap TV or projector on the wall. What I noticed was that our pastor was rushing to type out Bible verses last minute, or finding a song to put up, while also keeping an eye on his kids and welcoming people through the door. I wanted to make that one small thing easier.
            </p>
            <p>
              As I built it, I started to see who else it could bless: the persecuted church, voluntary pastors with no budget for software, impromptu home gatherings that just need something simple and focused. So I've kept it completely free. I'll keep maintaining and improving it as I'm able. If you'd like to donate (only cheerfully!) or share feedback, testimonies, bug reports, or feature requests, I'd love to hear from you.
            </p>
          </div>

          {/* Buttons */}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="https://ko-fi.com/valiantchan"
              target="_blank"
              rel="noopener noreferrer"
              className="pill flex items-center border border-[var(--brand-white)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
            >
              Donate
            </a>
            <Link
              to="/feedback"
              className="pill flex items-center border border-[var(--brand-white)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
            >
              Feedback
            </Link>
          </div>

          {/* Mono footnote */}
          <p className="mono mt-20 max-w-4xl text-xs leading-relaxed text-[var(--brand-white)]">
            phyto is short for phytoplankton. Organisms that use sunlight, freely available in abundance, to survive, live, and breathe. Our times of worship together should work the same way.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
