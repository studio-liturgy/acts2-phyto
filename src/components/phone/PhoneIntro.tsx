import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { APP_STORE_URL } from "@/lib/app-store";
import { BackLink } from "@/components/BackLink";
import { NoAccountChoice } from "@/components/NoAccountChoice";
import { useBackHomeSearch } from "@/hooks/use-back-home";
import { useNativeApp } from "@/hooks/use-native-app";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";
import { BACK_PAGE_TOP } from "@/lib/page-top";
import { INTRO_AUTO_MS, pageAt, slideOffset, slides, swipeStep } from "@/lib/intro-carousel";
import { PHONE_BTN, PHONE_BTN_COLUMN, PHONE_BTN_COLUMN_PAD } from "@/lib/phone-buttons";
import type { PhoneTab } from "@/lib/phone-layout";
// Imported (not public/) so they are hashed and kept in the app's offline
// cache: the intro plays from the phone, not the network.
import introSet from "@/assets/intro-set.mp4";
import introSetPoster from "@/assets/intro-set-poster.webp";
import introGathering from "@/assets/intro-gathering.mp4";
import introGatheringPoster from "@/assets/intro-gathering-poster.webp";
import introGolive from "@/assets/intro-golive.mp4";
import introGolivePoster from "@/assets/intro-golive-poster.webp";
import introRemote from "@/assets/intro-remote.mp4";
import introRemotePoster from "@/assets/intro-remote-poster.webp";
import introSignin from "@/assets/intro-signin.mp4";
import introSigninPoster from "@/assets/intro-signin-poster.webp";
import introGroups from "@/assets/intro-groups.mp4";
import introGroupsPoster from "@/assets/intro-groups-poster.webp";

type IntroPage = {
  title: string;
  text: string;
  /** A screen recording (MP4) for the card; an empty card until recorded. */
  clip?: string;
  /** The recording's first frame, shown until it plays. */
  poster?: string;
  /** A still picture for the card, for a page without a recording. */
  image?: string;
};

const PAGES: IntroPage[] = [
  {
    title: "Create Sets",
    text: "Import lyrics, scriptures or your own media, and add message slides. Add chords to songs and display songs and scriptures in more than one language",
    clip: introSet,
    poster: introSetPoster,
  },
  {
    title: "Create Gatherings",
    text: "Arrange sets into gatherings to present later on phones and screens",
    clip: introGathering,
    poster: introGatheringPoster,
  },
  {
    title: "Go Live",
    text: "Generate a link / QR code so that friends can follow along on their own phones",
    clip: introGolive,
    poster: introGolivePoster,
  },
  {
    title: "Present",
    text: "Connect to a TV with AirPlay, or remote control another device's screen through a link / QR code",
    clip: introRemote,
    poster: introRemotePoster,
  },
  {
    title: "Go Online",
    text: "Sign in to access your sets and sync them across devices",
    clip: introSignin,
    poster: introSigninPoster,
  },
  {
    title: "Groups + Sharing",
    text: "Create a group to share your catalogue and organize gatherings with friends, or share individual sets",
    clip: introGroups,
    poster: introGroupsPoster,
  },
];

/** A phone browser presents only as a remote (AirPlay is the app's). */
const BROWSER_PRESENT = {
  title: "Remote",
  text: "Control another device's screen through a link / QR code",
};

/** The pages for the app, or for a phone browser. */
function introPages(app: boolean): IntroPage[] {
  return app ? PAGES : PAGES.map((p) => (p.title === "Present" ? { ...p, ...BROWSER_PRESENT } : p));
}

const N = PAGES.length;
const SLIDE_MS = 450;
// The card's shape (from the mock-up) and its share of the screen's width.
const CARD_RATIO = 698 / 807;
const CARD_WIDTH = 0.65;

/**
 * The phone intro (app and phone browsers): six pages in a looping
 * carousel. The card slides sideways with a swipe (or by itself every 12 s),
 * the title and line above it fade, and nothing scrolls up or down.
 * Signed out it offers Sign In (and, in the app, Use without an account);
 * signed in, only Back; on the first sign-in (after the username), a
 * Continue pill under the carousel instead of Back.
 */
export function PhoneIntro({
  signedIn,
  signInOnly,
  emptyLibrary,
  firstRun = false,
}: {
  signedIn: boolean;
  /** Signed out and not using the app without an account: no Back. */
  signInOnly: boolean;
  emptyLibrary: boolean;
  /** The first sign-in, straight after choosing a username: Continue. */
  firstRun?: boolean;
}) {
  usePageBackgroundColor("var(--background)");
  const pages = introPages(useNativeApp() !== null);
  const backSearch = useBackHomeSearch();
  // Back always names a tab, so an empty account doesn't land on this
  // intro again.
  const backTab: PhoneTab = backSearch.tab ?? (emptyLibrary ? "catalogue" : "gatherings");

  // Steps taken, unwrapped (it goes below 0 or past the last page); the
  // page showing is `pos` wrapped. Every page is one element, so nothing is
  // swapped at the loop's seam.
  const [pos, setPos] = useState(0);
  // The position before the last step, to tell which page wraps round the
  // far side (that one moves without animation, off screen).
  const [fromPos, setFromPos] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [dragX, setDragX] = useState<number | null>(null);
  const drag = useRef<{ x: number; t: number; id: number } | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const page = pageAt(pos, N);

  const reduceMotion = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const go = (next: number) => {
    setAnimate(!reduceMotion());
    setFromPos(pos);
    setPos(next);
  };

  // Moves on by itself; any swipe restarts the wait.
  useEffect(() => {
    if (dragX !== null) return;
    const t = window.setTimeout(() => go(pos + 1), INTRO_AUTO_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, dragX]);

  // Only the page in view plays its recording. A page that leaves is set
  // back to its start once it has slid away, so it comes back in on its
  // first frame instead of the frame it stopped on.
  useEffect(() => {
    const timers: number[] = [];
    videos.current.forEach((v, i) => {
      if (!v) return;
      if (i === page) {
        v.play().catch(() => {});
      } else if (!v.paused || v.currentTime > 0) {
        v.pause();
        timers.push(
          window.setTimeout(() => {
            if (v.paused) v.currentTime = 0;
          }, SLIDE_MS),
        );
      }
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [page]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (drag.current) return;
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
      {!signInOnly && !firstRun && (
        <div className={`absolute inset-x-0 top-0 z-10 px-6 ${BACK_PAGE_TOP}`}>
          <BackLink search={{ tab: backTab }} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col justify-center pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]">
        {/* Title and line: all six stacked, the current one faded in, so
            nothing shifts between pages. Room for four lines of text. */}
        <div className="relative mx-auto h-9 w-full px-6">
          {pages.map((p, i) => (
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
          {pages.map((p, i) => (
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
          <div className="relative h-full">
            {pages.map((p, i) => {
              const offset = slideOffset(i, pos, N);
              const glide = sliding && slides(i, fromPos, pos, N);
              return (
                <div
                  key={p.title}
                  aria-hidden={i !== page}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transform: `translateX(calc(${offset * 100}% + ${dragX ?? 0}px))`,
                    transition: glide
                      ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                      : "none",
                  }}
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
                          src={p.poster}
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
              );
            })}
          </div>
        </div>

        {/* Dots: which page is showing. */}
        <div className="mt-8 flex justify-center gap-[3px]" aria-hidden>
          {pages.map((p, i) => (
            <span
              key={p.title}
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${i === page ? "bg-foreground" : "bg-foreground/30"}`}
            />
          ))}
        </div>
      </div>

      {!signedIn && (
        // The last button sits exactly where Cancel sits on the sign-in
        // page: same bottom gap (safe area + 24px) and the same 1px border.
        <div
          className={`${PHONE_BTN_COLUMN_PAD} pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-6`}
        >
          <div className={`${PHONE_BTN_COLUMN} flex flex-col gap-2`}>
            <Link
              to="/login"
              className={`${PHONE_BTN} border border-foreground bg-foreground text-background active:opacity-80`}
            >
              Sign In
            </Link>
            {signInOnly && (
              <NoAccountChoice
                className={`${PHONE_BTN} border border-foreground text-foreground active:bg-foreground active:text-background`}
              />
            )}
            <GetTheApp />
          </div>
        </div>
      )}
      {signedIn && firstRun && (
        // Continue sits where Sign In sits for a signed-out visitor.
        <div
          className={`${PHONE_BTN_COLUMN_PAD} pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-6`}
        >
          <div className={`${PHONE_BTN_COLUMN} flex flex-col gap-2`}>
            <Link
              to="/"
              search={{ tab: backTab }}
              replace
              className={`${PHONE_BTN} border border-foreground bg-foreground text-background active:opacity-80`}
            >
              Continue
            </Link>
            <GetTheApp />
          </div>
        </div>
      )}
      {signedIn && !firstRun && (
        <>
          {/* Browsers: the App Store pill. The app keeps the plain gap. */}
          <div
            data-web-only
            className={`${PHONE_BTN_COLUMN_PAD} pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-6`}
          >
            <div className={`${PHONE_BTN_COLUMN} flex flex-col gap-2`}>
              <GetTheApp />
            </div>
          </div>
          <div data-app-only className="pb-[calc(env(safe-area-inset-bottom,0px)+2.25rem)]" />
        </>
      )}
    </div>
  );
}

/** "Get the iPhone app" under the carousel, in browsers only ([data-web-only]
 *  hides it in the app before paint). */
function GetTheApp() {
  return (
    <a
      data-web-only
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`${PHONE_BTN} flex items-center justify-center gap-1.5 border border-foreground text-foreground active:bg-foreground active:text-background`}
    >
      Get the iPhone app <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}
