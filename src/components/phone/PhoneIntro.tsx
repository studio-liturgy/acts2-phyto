import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BackLink } from "@/components/BackLink";
import { NoAccountChoice } from "@/components/NoAccountChoice";
import { useBackHomeSearch } from "@/hooks/use-back-home";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";
import { BACK_PAGE_TOP } from "@/lib/page-top";
import { INTRO_AUTO_MS, loopJump, pageAt, swipeStep } from "@/lib/intro-carousel";
import { PHONE_BTN, PHONE_BTN_COLUMN, PHONE_BTN_COLUMN_PAD } from "@/lib/phone-buttons";
import type { PhoneTab } from "@/lib/phone-layout";

type IntroPage = {
  title: string;
  text: string;
  /** A screen recording (MP4) for the card; an empty card until recorded. */
  clip?: string;
  /** A still picture for the card, for a page without a recording. */
  image?: string;
};

const PAGES: IntroPage[] = [
  {
    title: "Create Sets",
    text: "Import lyrics, scriptures or your own media, and add message slides. Add chords to songs and display songs and scriptures in more than one language",
    clip: "/intro-set.mp4",
  },
  {
    title: "Create Gatherings",
    text: "Arrange sets into gatherings to present later on phones and screens",
    clip: "/intro-gathering.mp4",
  },
  {
    title: "Go Live",
    text: "Generate a link / QR code so that friends can follow along on their own phones",
    clip: "/intro-golive.mp4",
  },
  {
    title: "Present",
    text: "Connect to a TV with AirPlay, or remote control another device's screen through a link / QR code",
    clip: "/intro-remote.mp4",
  },
  {
    title: "Go Online",
    text: "Sign in to access your sets and sync them across devices",
    clip: "/intro-signin.mp4",
  },
  {
    title: "Groups + Sharing",
    text: "Create a group to share your catalogue and organize gatherings with friends, or share individual sets",
    clip: "/intro-groups.mp4",
  },
];

const N = PAGES.length;
// The track: a copy of the last page, the pages, then a copy of the first.
const TRACK = [PAGES[N - 1], ...PAGES, PAGES[0]];
const SLIDE_MS = 450;
// The card's shape (from the mock-up) and its share of the screen's width.
const CARD_RATIO = 698 / 807;
const CARD_WIDTH = 0.65;

/**
 * The phone intro (app and phone browsers): six pages in a looping
 * carousel. The card slides sideways with a swipe (or by itself every 12 s),
 * the title and line above it fade, and nothing scrolls up or down.
 * Signed out it offers Sign In (and, in the app, Use without an account);
 * signed in, only Back.
 */
export function PhoneIntro({
  signedIn,
  signInOnly,
  emptyLibrary,
}: {
  signedIn: boolean;
  /** Signed out and not using the app without an account: no Back. */
  signInOnly: boolean;
  emptyLibrary: boolean;
}) {
  usePageBackgroundColor("var(--background)");
  const backSearch = useBackHomeSearch();
  // Back always names a tab, so an empty account doesn't land on this
  // intro again.
  const backTab: PhoneTab = backSearch.tab ?? (emptyLibrary ? "catalogue" : "gatherings");

  const [pos, setPos] = useState(1);
  const [animate, setAnimate] = useState(true);
  const [dragX, setDragX] = useState<number | null>(null);
  const drag = useRef<{ x: number; t: number; id: number } | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const page = pageAt(pos, N);

  const reduceMotion = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const go = (next: number) => {
    if (reduceMotion()) {
      // No slide: straight to the real page (no transition end to wait for).
      setAnimate(false);
      setPos(loopJump(next, N) ?? next);
      return;
    }
    setAnimate(true);
    setPos(next);
  };

  // After sliding onto a copy, jump to the real page without animation.
  const onTransitionEnd = () => {
    const real = loopJump(pos, N);
    if (real === null) return;
    setAnimate(false);
    setPos(real);
  };
  // Animation back on once the jump has painted.
  useEffect(() => {
    if (animate) return;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [animate]);

  // Moves on by itself; any swipe or dot tap restarts the wait.
  useEffect(() => {
    if (dragX !== null) return;
    const t = window.setTimeout(() => go(pos + 1), INTRO_AUTO_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, dragX]);

  // Only the page in view plays its recording, from the start each time.
  useEffect(() => {
    videos.current.forEach((v, i) => {
      if (!v) return;
      if (i === pos) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else v.pause();
    });
  }, [pos]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (drag.current) return;
    // Mid-loop on a copy: settle on the real page first.
    const real = loopJump(pos, N);
    if (real !== null) {
      setAnimate(false);
      setPos(real);
    }
    drag.current = { x: e.clientX, t: performance.now(), id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragX(0);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    setDragX(e.clientX - drag.current.x);
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const dx = e.clientX - d.x;
    const width = viewport.current?.offsetWidth ?? window.innerWidth;
    const step = swipeStep(dx, width, performance.now() - d.t);
    setDragX(null);
    go(pos + step);
  };

  const sliding = animate && dragX === null;

  return (
    <div className="fixed inset-0 flex touch-none select-none flex-col overflow-hidden overscroll-none bg-background text-foreground">
      {!signInOnly && (
        <div className={`absolute inset-x-0 top-0 z-10 px-6 ${BACK_PAGE_TOP}`}>
          <BackLink search={{ tab: backTab }} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col justify-center pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]">
        {/* Title and line: all six stacked, the current one faded in, so
            nothing shifts between pages. Room for four lines of text. */}
        <div className="relative mx-auto h-9 w-full px-6">
          {PAGES.map((p, i) => (
            <h1
              key={p.title}
              aria-hidden={i !== page}
              className={`mono absolute inset-x-0 top-0 whitespace-nowrap text-center text-[min(28px,7.5vw)] uppercase leading-9 text-foreground/85 transition-opacity duration-300 ${i === page ? "opacity-100" : "opacity-0"}`}
            >
              {p.title}
            </h1>
          ))}
        </div>
        <div className="relative mx-auto mt-6 h-[4.125rem] w-full px-10">
          {PAGES.map((p, i) => (
            <p
              key={p.title}
              aria-hidden={i !== page}
              className={`mono absolute inset-x-10 top-0 text-center text-[11px] uppercase leading-[1.5] tracking-wide transition-opacity duration-300 ${i === page ? "opacity-100" : "opacity-0"}`}
            >
              {p.text}
            </p>
          ))}
        </div>

        {/* The cards: one screen-wide slide per page; only the middle one shows. */}
        <div
          ref={viewport}
          className="mt-7 min-h-0 flex-1 overflow-hidden [container-type:size]"
          style={{ maxHeight: `calc(${CARD_WIDTH * 100}vw / ${CARD_RATIO})` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className="flex h-full"
            style={{
              transform: `translateX(calc(${-pos * 100}% + ${dragX ?? 0}px))`,
              transition: sliding
                ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                : "none",
            }}
            onTransitionEnd={onTransitionEnd}
          >
            {TRACK.map((p, i) => (
              <div
                key={i}
                aria-hidden={i !== pos}
                className="flex h-full w-full shrink-0 items-center justify-center"
              >
                <div
                  className="relative overflow-hidden rounded-[2rem] border border-foreground/60"
                  style={{
                    width: `min(${CARD_WIDTH * 100}cqw, calc(100cqh * ${CARD_RATIO}))`,
                    aspectRatio: `${CARD_RATIO}`,
                  }}
                >
                  {p.image && (
                    <img
                      src={p.image}
                      alt=""
                      aria-hidden
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {p.clip && (
                    <>
                      {/* The first frame shows until the recording plays. */}
                      <img
                        src={p.clip.replace(/\.mp4$/, "-poster.webp")}
                        alt=""
                        aria-hidden
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <video
                        ref={(el) => {
                          videos.current[i] = el;
                        }}
                        src={p.clip}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        onPlaying={(e) => {
                          e.currentTarget.style.opacity = "1";
                        }}
                        style={{ opacity: 0 }}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dots: which page is showing. */}
        <div className="mt-8 flex justify-center gap-[3px]" aria-hidden>
          {PAGES.map((p, i) => (
            <span
              key={p.title}
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${i === page ? "bg-foreground" : "bg-foreground/30"}`}
            />
          ))}
        </div>
      </div>

      {!signedIn && (
        <div
          className={`${PHONE_BTN_COLUMN_PAD} pb-[calc(env(safe-area-inset-bottom,0px)+2.25rem)] pt-6`}
        >
          <div className={`${PHONE_BTN_COLUMN} flex flex-col gap-2`}>
            <Link
              to="/login"
              className={`${PHONE_BTN} bg-foreground text-background active:opacity-80`}
            >
              Sign In
            </Link>
            {signInOnly && (
              <NoAccountChoice
                className={`${PHONE_BTN} border border-foreground text-foreground active:bg-foreground active:text-background`}
              />
            )}
          </div>
        </div>
      )}
      {signedIn && <div className="pb-[calc(env(safe-area-inset-bottom,0px)+2.25rem)]" />}
    </div>
  );
}
