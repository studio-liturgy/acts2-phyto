import { Link } from "@tanstack/react-router";
import { Plus, ArrowUpRight, ArrowDown, X } from "lucide-react";
import { Fragment, forwardRef, useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BackToTop } from "@/components/BackToTop";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";
import type { SetKind } from "@/lib/types";
import type { SyncState } from "@/hooks/use-sync-status";
import wordmark from "@/assets/wordmark.svg";
import wordmarkTest from "@/assets/wordmark-test.svg";

const isTest = import.meta.env.VITE_APP_ENV === "test";
const aboutBg = "/about-bg.jpg";
const linkCls = "mono uppercase transition-opacity duration-200 hover:opacity-60";
const MOBILE_POPUP_DISMISSED_KEY = "phyto-mobile-popup-dismissed";
const MOBILE_POPUP_SUBSCRIBED_KEY = "phyto-mobile-popup-subscribed";
const MOBILE_POPUP_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

type Step = {
  n: number;
  navLabel: string;
  color: string;
  textA: React.ReactNode;
  textB: React.ReactNode;
  /** MP4 video src. videoB is omitted on cards that show a single, wider video. */
  videoA: string;
  videoB?: string;
  /** Number glyph path from the design SVGs (viewBox 0 0 431 431). */
  svgPath: string;
};

/** Decorative card flow-arrow (viewBox 0 0 686 682), shared by all three cards (the source
 *  design drew a slightly different arrow per card, which read as visually inconsistent once
 *  built). The top horizontal hook's end-x is parameterised: card 1's textA box sits further
 *  right than cards 2/3's, so it needs a longer hook to "point toward" it without crossing it. */
function cardArrowPath(hookEndX: number) {
  return `M93.9566 613.061C94.5424 612.475 94.5424 611.525 93.9566 610.939L84.4107 601.393C83.8249 600.808 82.8751 600.808 82.2894 601.393C81.7036 601.979 81.7036 602.929 82.2894 603.515L90.7746 612L82.2893 620.485C81.7036 621.071 81.7036 622.021 82.2893 622.607C82.8751 623.192 83.8249 623.192 84.4107 622.607L93.9566 613.061ZM64 612L64 613.5L92.896 613.5L92.896 612L92.896 610.5L64 610.5L64 612ZM${hookEndX} 61L${hookEndX} 59.5L64 59.5L64 61L64 62.5L${hookEndX} 62.5L${hookEndX} 61ZM34 91L32.5 91L32.5 582L34 582L35.5 582L35.5 91L34 91ZM64 61L64 59.5C46.603 59.5 32.5 73.6031 32.5 91L34 91L35.5 91C35.5 75.2599 48.2599 62.5 64 62.5L64 61ZM64 612L64 610.5C48.2599 610.5 35.5 597.74 35.5 582L34 582L32.5 582C32.5 599.397 46.603 613.5 64 613.5L64 612Z`;
}

const STEPS: Step[] = [
  {
    n: 1,
    navLabel: "Create Sets / Gathering",
    color: "var(--brand-blue)",
    textA: "Create your sets by importing song lyrics, scriptures, or your own media",
    textB: "Arrange those sets into a gathering to stay organized and present later on",
    videoA: "/landing-1.mp4",
    videoB: "/landing-2.mp4",
    svgPath:
      "M164.889 305.578V285.157H216.772V131.996H213.627L183.493 200.853H161.745V199.282L196.071 122.309H238.783V285.157H290.665V305.578H164.889Z",
  },
  {
    n: 2,
    navLabel: "Go Online (optional)",
    color: "var(--brand-green)",
    textA: "Sign in to sync your content across devices or Make a gathering go live",
    textB: "Now, your friends can view it on their own mobile device!",
    videoA: "/landing-3.mp4",
    videoB: "/landing-4.mp4",
    svgPath:
      "M154.115 308.229V276.884C154.115 265.739 156.553 256.509 161.429 249.195C166.305 241.881 173.184 235.96 182.065 231.433C190.946 226.731 201.482 223.074 213.671 220.462C229.17 216.979 240.315 212.016 247.107 205.573C254.072 198.955 257.555 191.032 257.555 181.802V180.235C257.555 173.966 256.162 167.958 253.376 162.212C250.589 156.291 246.149 151.502 240.054 147.845C234.133 144.014 226.384 142.098 216.806 142.098C203.571 142.098 193.21 146.191 185.722 154.375C178.234 162.56 174.49 173.444 174.49 187.027V198.52H152.548V185.459C152.548 174.314 154.986 163.953 159.862 154.375C164.738 144.623 171.965 136.787 181.542 130.866C191.12 124.771 202.875 121.724 216.806 121.724C230.911 121.724 242.579 124.51 251.808 130.082C261.038 135.481 267.917 142.446 272.444 150.979C277.146 159.512 279.497 168.481 279.497 177.884V182.586C279.497 196.343 275.143 208.185 266.436 218.111C257.729 228.037 243.798 235.09 224.642 239.269C208.099 242.926 195.822 247.802 187.811 253.897C179.975 259.818 176.057 268.525 176.057 280.018V287.855H277.93V308.229H154.115Z",
  },
  {
    n: 3,
    navLabel: "Start Presenting",
    color: "var(--brand-orange)",
    textA: "Connect your computer to a TV or projector, then hit Present in the top right",
    textB: "Drag the Output window to your display and control it through the presenter view",
    videoA: "/landing-5.mp4",
    svgPath:
      "M218.635 311.888C204.878 311.888 193.036 309.189 183.11 303.791C173.184 298.218 165.522 290.904 160.123 281.849C154.899 272.619 152.287 262.432 152.287 251.287V237.182H174.229V249.72C174.229 262.78 178.408 273.055 186.767 280.543C195.126 287.857 205.574 291.514 218.112 291.514C225.775 291.514 232.653 289.859 238.748 286.551C245.017 283.068 249.893 278.54 253.376 272.968C257.033 267.221 258.861 260.865 258.861 253.899V252.332C258.861 241.361 255.379 232.828 248.413 226.733C241.447 220.464 232.74 217.329 222.292 217.329H197.738V187.029L257.294 148.892V145.757H153.854V125.383H276.101V158.818L216.545 196.955V200.089H226.994C236.223 200.089 244.93 202.092 253.115 206.097C261.299 210.103 267.917 215.936 272.967 223.599C278.191 231.087 280.803 240.403 280.803 251.548V256.25C280.803 266.699 278.104 276.189 272.706 284.722C267.307 293.081 259.906 299.698 250.503 304.574C241.099 309.45 230.476 311.888 218.635 311.888Z",
  },
];

/** Inter-card connectors lifted verbatim from the design SVG: a cream bracket arrow that
 *  hooks off one card's lower-right and points into the next card, plus a short stub stroke
 *  through the 30px gap tinted to the *next* card's colour. Indexed by gap (0 = 1→2, 1 = 2→3).
 *  `windowMinY`/`windowHeight` tightly bound each arrowPath's own y-extent (+10px padding) so
 *  every connector renders centred and at consistent scale, instead of a generic gap-relative
 *  guess (the two source arrows aren't actually the same height in the design). */
const CONNECTORS = [
  {
    windowMinY: 605.5,
    windowHeight: 171,
    strokePath: "M622 647L622 735",
    arrowPath:
      "M553.939 766.061C553.354 765.475 553.354 764.525 553.939 763.939L563.485 754.393C564.071 753.808 565.021 753.808 565.607 754.393C566.192 754.979 566.192 755.929 565.607 756.515L557.121 765L565.607 773.485C566.192 774.071 566.192 775.021 565.607 775.607C565.021 776.192 564.071 776.192 563.485 775.607L553.939 766.061ZM592 765L592 766.5L555 766.5L555 765L555 763.5L592 763.5L592 765ZM479.5 617L479.5 615.5L592 615.5L592 617L592 618.5L479.5 618.5L479.5 617ZM622 647L623.5 647L623.5 735L622 735L620.5 735L620.5 647L622 647ZM592 617L592 615.5C609.397 615.5 623.5 629.603 623.5 647L622 647L620.5 647C620.5 631.26 607.74 618.5 592 618.5L592 617ZM592 765L592 763.5C607.74 763.5 620.5 750.74 620.5 735L622 735L623.5 735C623.5 752.397 609.397 766.5 592 766.5L592 765Z",
  },
  {
    // copied verbatim from connector 0 (blue→green), which renders correctly — connector 1's
    // own source-design geometry didn't render right after the inter-card gap was removed.
    windowMinY: 605.5,
    windowHeight: 171,
    strokePath: "M622 647L622 735",
    arrowPath:
      "M553.939 766.061C553.354 765.475 553.354 764.525 553.939 763.939L563.485 754.393C564.071 753.808 565.021 753.808 565.607 754.393C566.192 754.979 566.192 755.929 565.607 756.515L557.121 765L565.607 773.485C566.192 774.071 566.192 775.021 565.607 775.607C565.021 776.192 564.071 776.192 563.485 775.607L553.939 766.061ZM592 765L592 766.5L555 766.5L555 765L555 763.5L592 763.5L592 765ZM479.5 617L479.5 615.5L592 615.5L592 617L592 618.5L479.5 618.5L479.5 617ZM622 647L623.5 647L623.5 735L622 735L620.5 735L620.5 647L622 647ZM592 617L592 615.5C609.397 615.5 623.5 629.603 623.5 647L622 647L620.5 647C620.5 631.26 607.74 618.5 592 618.5L592 617ZM592 765L592 763.5C607.74 763.5 620.5 750.74 620.5 735L622 735L623.5 735C623.5 752.397 609.397 766.5 592 766.5L592 765Z",
  },
];

/** Filter-chip styling for the sticky section nav — mirrors `kindChip()` in index.tsx. */
const NAV_CHIP = [
  {
    active: "border-[var(--brand-blue)] bg-[var(--brand-blue)] text-[var(--brand-white)]",
    idle: "border-[var(--brand-blue)] text-[var(--brand-blue)] hover:bg-[var(--brand-blue)] hover:text-[var(--brand-white)]",
  },
  {
    active: "border-[var(--brand-green)] bg-[var(--brand-green)] text-[var(--brand-white)]",
    idle: "border-[var(--brand-green)] text-[var(--brand-green)] hover:bg-[var(--brand-green)] hover:text-[var(--brand-white)]",
  },
  {
    active: "border-[var(--brand-orange)] bg-[var(--brand-orange)] text-[var(--brand-white)]",
    idle: "border-[var(--brand-orange)] text-[var(--brand-orange)] hover:bg-[var(--brand-orange)] hover:text-[var(--brand-white)]",
  },
];

/** Video slot, square by default (pass `aspectClassName` to override, e.g. a wider single-video
 *  card). Shows a translucent panel until the clip loads. The parent drives play/pause via ref. */
const StepVideo = forwardRef<
  HTMLVideoElement,
  { src: string; className?: string; aspectClassName?: string }
>(function StepVideo({ src, className, aspectClassName = "aspect-square" }, ref) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-black/10 ${aspectClassName} ${className ?? ""}`}
    >
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="auto"
        onLoadedData={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <source src={src} type="video/mp4" />
      </video>
    </div>
  );
});

export function FirstTimeLanding({
  onNewGathering,
  onNewSet,
  isSignedIn,
  isEmpty,
  userEmail,
  syncStatus,
  onSignOut,
}: {
  onNewGathering: () => void;
  onNewSet: (kind: SetKind) => void;
  isSignedIn: boolean;
  isEmpty: boolean;
  userEmail: string | null | undefined;
  syncStatus: SyncState;
  onSignOut: () => void;
}) {
  // Tints the mobile overscroll/safe-area chrome (top + bottom) to match the page
  // instead of showing default white/dark bars — same fix used on /about and /legal.
  usePageBackgroundColor("var(--brand-blue)");

  const [activeIndex, setActiveIndex] = useState(0);

  const sectionRef = useRef<HTMLDivElement | null>(null);
  const circleRef = useRef<HTMLDivElement | null>(null); // rotating ring + number
  const circleStickyRef = useRef<HTMLDivElement | null>(null);
  const circleBoundRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const navBoundRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[][]>([[], [], []]);

  // Mobile: each step gets its own clipped-edge circle that spins independently as
  // its section scrolls through the viewport (vs. the single interpolating circle above).
  const mobileSectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const mobileCircleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const mobileVideoRefs = useRef<(HTMLVideoElement | null)[][]>([[], [], []]);

  const [popupDismissed, setPopupDismissed] = useState(true);

  const active = STEPS[activeIndex];

  // JS-driven snap: after the user stops scrolling, gently snap to the nearest card.
  // Using scrollend (where available) + debounce fallback. A snapping flag prevents loops.
  useEffect(() => {
    let snapping = false;
    const snap = () => {
      if (snapping) return;
      const sectionEl = sectionRef.current;
      if (!sectionEl) return;
      const sr = sectionEl.getBoundingClientRect();
      // Only snap while viewport center is actually inside the cards section.
      const midY = window.innerHeight / 2;
      if (sr.top > midY || sr.bottom < midY) return;
      let closest = -1;
      let minDist = Infinity;
      cardRefs.current.forEach((c, i) => {
        if (!c) return;
        const r = c.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - midY);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });
      if (closest >= 0 && minDist > 30) {
        snapping = true;
        cardRefs.current[closest]?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          snapping = false;
        }, 800);
      }
    };
    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = window.setTimeout(snap, 220);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, []);

  // Which card is centered → drives nav fill, circle number/color, emphasis, video play.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const c of cardRefs.current) if (c) io.observe(c);
    return () => io.disconnect();
  }, []);

  // Rotate the whole circle (ring + number) as you scroll: one full 360° turn between
  // consecutive cards, landing upright whenever a card is centered. rAF-throttled and
  // applied to a ref so there's no React re-render per frame.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const circle = circleRef.current;
      if (!circle) return;
      const centerY = window.innerHeight / 2;
      const centers = cardRefs.current.map((c) => {
        const b = c?.getBoundingClientRect();
        return b ? b.top + b.height / 2 : 0;
      });
      // Continuous "card progress": 0 at card 0 centered, 1 at card 1, 2 at card 2.
      // centers[0] < centers[1] < centers[2] in viewport coords (card 0 is highest on page).
      // As user scrolls DOWN, centers decrease (cards move up). cp increases 0→2.
      let cp = 0;
      if (centerY <= centers[0]) cp = 0;
      else if (centerY >= centers[centers.length - 1]) cp = centers.length - 1;
      else {
        for (let i = 0; i < centers.length - 1; i++) {
          if (centerY >= centers[i] && centerY <= centers[i + 1]) {
            cp = i + (centerY - centers[i]) / (centers[i + 1] - centers[i] || 1);
            break;
          }
        }
      }
      // translateX(-40%) shifts the circle left by 40% of its own width,
      // so only ~20% of the circle overlaps the card column.
      circle.style.transform = `translateX(-40%) rotate(${cp * 360}deg)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Bound the sticky circle + nav to [card1 center, card3 center], and record card pixel
  // sizes for the arrow geometry. Re-measured on resize / layout change.
  useEffect(() => {
    const measure = () => {
      const c1 = cardRefs.current[0];
      const c3 = cardRefs.current[2];
      if (c1 && c3) {
        const c1Center = c1.offsetTop + c1.offsetHeight / 2;
        const c3Center = c3.offsetTop + c3.offsetHeight / 2;
        const bind = (bound: HTMLDivElement | null, sticky: HTMLElement | null) => {
          if (!bound || !sticky) return;
          const sh = sticky.offsetHeight;
          bound.style.marginTop = `${c1Center - sh / 2}px`;
          bound.style.height = `${c3Center - c1Center + sh}px`;
        };
        bind(navBoundRef.current, navRef.current);
        bind(circleBoundRef.current, circleStickyRef.current);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (sectionRef.current) ro.observe(sectionRef.current);
    for (const c of cardRefs.current) if (c) ro.observe(c);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Only the active card's two clips play; everything else is paused.
  useEffect(() => {
    videoRefs.current.forEach((pair, idx) => {
      for (const v of pair) {
        if (!v) continue;
        if (idx === activeIndex) v.play().catch(() => {});
        else v.pause();
      }
    });
  }, [activeIndex]);

  const goToCard = (i: number) =>
    cardRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });

  // Desktop card and mobile section are two separate (CSS-hidden) trees; only the
  // visible one actually scrolls — the hidden one's scrollIntoView is a no-op.
  const goToFirstStep = () => {
    goToCard(0);
    mobileSectionRefs.current[0]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Mobile popup: stays hidden until we've checked localStorage post-mount, so it
  // never flashes for a user who already dismissed it. A dismissal (no email
  // submitted) only snoozes the popup for MOBILE_POPUP_SNOOZE_MS; submitting an
  // email hides it for good.
  useEffect(() => {
    if (localStorage.getItem(MOBILE_POPUP_SUBSCRIBED_KEY) === "1") {
      setPopupDismissed(true);
      return;
    }
    const dismissedAt = Number(localStorage.getItem(MOBILE_POPUP_DISMISSED_KEY) ?? 0);
    setPopupDismissed(Date.now() - dismissedAt < MOBILE_POPUP_SNOOZE_MS);
  }, []);

  const dismissMobilePopup = () => {
    localStorage.setItem(MOBILE_POPUP_DISMISSED_KEY, String(Date.now()));
    setPopupDismissed(true);
  };

  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );

  // Same Resend Audience the sign-in page's "subscribe" checkbox adds to (see
  // sendWelcomeIfNew/login.tsx) — skipEmail so this doesn't also trigger the
  // "Welcome to phyto" account email, since there's no account here.
  const submitMobileSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subscribeStatus === "submitting" || subscribeStatus === "done") return;
    setSubscribeStatus("submitting");
    try {
      const res = await fetch("/api/auth/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subscribeEmail, subscribe: true, skipEmail: true }),
      });
      if (res.ok) localStorage.setItem(MOBILE_POPUP_SUBSCRIBED_KEY, "1");
      setSubscribeStatus(res.ok ? "done" : "error");
    } catch {
      setSubscribeStatus("error");
    }
  };

  // Mobile: each circle only spins while it's pinned (CSS sticky holding it at
  // viewport middle, `top: calc(50vh - 2.5rem)` in the JSX below) — not while
  // it's scrolling normally with the page before or after that. Computed as a
  // deterministic clamp on the wrapper's raw scroll position (same threshold the
  // CSS `top` value targets) rather than inferred from frame deltas — a
  // delta/velocity-based "is it currently moving" check is unreliable (slow
  // scrolling looks identical to "pinned"), and produced drift instead of a
  // clean sweep. Clamping guarantees rotation is exactly 0° (upright) before the
  // pinned phase and exactly 360° (upright) after it, with no accumulation
  // drift. rAF-throttled.
  useEffect(() => {
    const CIRCLE_SIZE = 80; // h-20/w-20
    const EXTRA_BOTTOM = 24; // matches the -bottom-6 extension on the sticky containing block in JSX
    let raf = 0;
    const update = () => {
      raf = 0;
      const stuckY = window.innerHeight / 2 - CIRCLE_SIZE / 2; // matches calc(50vh - 2.5rem)
      mobileCircleRefs.current.forEach((circle, i) => {
        const sectionEl = mobileSectionRefs.current[i];
        if (!circle || !sectionEl) return;
        const r = sectionEl.getBoundingClientRect();
        if (r.height === 0) return; // hidden (desktop viewport)
        const progress = Math.min(
          1,
          Math.max(0, (stuckY - r.top) / Math.max(1, r.height + EXTRA_BOTTOM - CIRCLE_SIZE)),
        );
        const spinSign = i === 1 ? 1 : -1; // blue/orange counter-clockwise, green clockwise
        circle.style.transform = `rotate(${spinSign * progress * 360}deg)`;
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Mobile videos play while their own section is in view (no "active card" concept
  // since steps are stacked, not snap-carouseled).
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        }
      },
      { rootMargin: "0px", threshold: 0.25 },
    );
    for (const pair of mobileVideoRefs.current) for (const v of pair) if (v) io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <main className="flex-1">
      {/* ── Top band: about-page background + overlay chrome + centered wordmark ── */}
      <section
        className="relative flex min-h-[60svh] w-full flex-col justify-center bg-[var(--brand-blue)] text-[var(--brand-white)] md:block md:min-h-0"
        style={{
          backgroundImage: `url(${aboutBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Overlay chrome — aligned to the content column, like the regular home header.
            An invisible Present placeholder reserves the same row height the real Present
            button gives the normal header, so the pills sit at the identical position. */}
        <div className="absolute inset-x-0 top-0">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 pt-6 md:pt-10">
            {!isEmpty && (
              <Link
                to="/"
                search={{}}
                className="pill mono uppercase border border-[var(--brand-white)] px-4 py-1.5 text-xs tracking-wider text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
              >
                Back
              </Link>
            )}
            {!isSignedIn && !isEmpty && (
              <Link
                to="/login"
                className="pill mono uppercase hidden border border-[var(--brand-white)] px-4 py-1.5 text-xs tracking-wider text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)] md:inline-block"
              >
                Sign in
              </Link>
            )}
            {isSignedIn && (
              <button
                onClick={onSignOut}
                className="pill mono uppercase border border-[var(--brand-white)] px-4 py-1.5 text-xs tracking-wider text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
              >
                Sign out
              </button>
            )}
            {isSignedIn && syncStatus !== "offline" && userEmail && (
              <span className="mono text-xs uppercase tracking-wider text-[var(--brand-white)]/70">
                {userEmail}
              </span>
            )}
            {isSignedIn && syncStatus !== "offline" && (
              <span
                data-sync={syncStatus}
                className={`h-4 w-4 rounded-full ${syncStatus === "syncing" ? "bg-[var(--brand-orange)]" : "bg-[var(--brand-green)]"}`}
                style={{
                  transition: `background-color ${syncStatus === "syncing" ? "0.5s" : "1.5s"} ease`,
                }}
                title={syncStatus === "syncing" ? "Syncing…" : "Synced"}
              />
            )}
            {/* invisible — matches the height the Present button adds to the normal header */}
            <span
              aria-hidden
              className="pill invisible ml-auto flex items-center gap-3 border px-[30px] py-[12px] text-5xl tracking-[-0.045em]"
            >
              Present <ArrowUpRight className="size-[1em]" />
            </span>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 pb-16 pt-24 text-center md:pb-24 md:pt-28">
          <Link to="/" className="inline-block">
            <img
              src={isTest ? wordmarkTest : wordmark}
              alt={isTest ? "phytoexp" : "phyto"}
              className="mx-auto h-16 w-auto md:h-16"
            />
          </Link>
          <h1 className="mt-10 text-5xl leading-[1.1] md:text-6xl">
            <span className="md:hidden">
              Built for small home worship gatherings,
              <br />
              like yours and mine.
            </span>
            <span className="hidden md:inline">
              Built for small home worship gatherings,
              <br />
              like yours and mine.
            </span>
          </h1>
        </div>
      </section>

      {/* ── Intro + primary actions (cream) ── */}
      <section className="mx-auto max-w-6xl px-6 pt-14 text-center">
        <div className="space-y-4 text-base text-foreground/80">
          <p className="md:hidden">
            Designed to be simple, so that we can focus on who matters most: Jesus.
          </p>
          <p className="hidden md:block">
            I made this app to be an intentionally stripped back alternative to keep presenting
            simple and organized.
            <br />
            It's designed to be easy to use and to protect the simplicity of worshipping with
            friends and family at home.
          </p>
          <p className="hidden md:block">
            All so that we can focus on the one who matters most: Jesus.
          </p>
        </div>

        <div className="mt-10 hidden flex-wrap items-center justify-center gap-3 md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="pill mono uppercase flex items-center gap-2 bg-foreground px-6 py-3 text-sm tracking-wider text-background transition hover:opacity-90">
                <Plus className="h-4 w-4" /> New Set
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem
                onClick={() => onNewSet("song")}
                className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-blue)] focus:text-[var(--brand-white)]"
              >
                New Song
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onNewSet("scripture")}
                className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-green)] focus:text-[var(--brand-white)]"
              >
                New Scripture
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onNewSet("media")}
                className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-orange)] focus:text-[var(--brand-white)]"
              >
                New Media
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isSignedIn || !isEmpty ? (
            <button
              onClick={onNewGathering}
              className="pill mono uppercase flex items-center gap-2 border border-foreground px-6 py-3 text-sm tracking-wider transition hover:bg-foreground hover:text-background"
            >
              <Plus className="h-4 w-4" /> New Gathering
            </button>
          ) : (
            <Link
              to="/login"
              className="pill mono uppercase flex items-center gap-2 border border-foreground px-6 py-3 text-sm tracking-wider transition hover:bg-foreground hover:text-background"
            >
              Sign In
            </Link>
          )}
        </div>

        <button
          type="button"
          onClick={goToFirstStep}
          className="mono uppercase mx-auto mt-10 inline-flex items-center gap-3 text-xs tracking-wider text-muted-foreground transition-opacity hover:opacity-60 md:mt-20"
        >
          <span className="md:hidden">Learn more about how it works below</span>
          <span className="hidden md:inline">
            Below is a short guide to get you started with phyto!
          </span>
          <ArrowDown className="h-4 w-4" />
        </button>
      </section>

      {/* ── Mobile-only "stay tuned" popup. Loads as normal in-flow content (scrolls
          with the page) right here; once its top edge would scroll just past the top
          of the viewport, it sticks there for the remainder of the page (no overflow
          ancestor between here and <main>'s end, so its sticky range isn't bounded
          early). Dismissible, remembered via localStorage.

          Colored brand-blue (not white) on purpose: iOS Safari auto-matches its
          toolbar/safe-area color to whatever sticky element looks like a "header"
          near the top of the viewport, and was picking up this popup's white
          background instead of the page's actual blue — recoloring it to match
          the page is what actually fixes the white safe-area bar, not fighting
          Safari's heuristic. ── */}
      {!popupDismissed && (
        <div className="sticky top-4 z-50 mx-4 mt-6 md:hidden">
          <div className="relative rounded-3xl border border-[var(--brand-white)] bg-[var(--brand-blue)] p-5 text-center text-[var(--brand-white)]">
            <button
              type="button"
              onClick={dismissMobilePopup}
              aria-label="Dismiss"
              className="absolute right-3 top-3 text-[var(--brand-white)]/60 transition-opacity hover:opacity-80"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mono text-xs uppercase tracking-wider">
              Be notified when mobile launches
            </p>
            {subscribeStatus === "done" ? (
              <p className="mono mt-4 text-xs uppercase tracking-wider">You're on the list!</p>
            ) : (
              <form onSubmit={submitMobileSubscribe} className="relative mt-4">
                <input
                  type="email"
                  required
                  value={subscribeEmail}
                  onChange={(e) => {
                    setSubscribeEmail(e.target.value);
                    if (subscribeStatus === "error") setSubscribeStatus("idle");
                  }}
                  placeholder="Email address"
                  disabled={subscribeStatus === "submitting"}
                  className="mono w-full rounded-full border border-[var(--brand-white)]/30 bg-transparent py-3 pl-5 pr-14 text-[16px] uppercase tracking-wider text-[var(--brand-white)] outline-none placeholder:text-[var(--brand-white)]/50 focus:border-[var(--brand-white)]/60 disabled:opacity-60"
                />
                <button
                  type="submit"
                  aria-label="Submit"
                  disabled={subscribeStatus === "submitting"}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--brand-white)] text-[var(--brand-blue)] transition hover:opacity-90 disabled:opacity-60"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </form>
            )}
            {subscribeStatus === "error" && (
              <p className="mono mt-2 text-xs uppercase tracking-wider text-[var(--brand-white)]/70">
                Something went wrong — try again?
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Middle: rotating circle | snap cards | sticky nav (desktop only — mobile has its own stacked layout below) ── */}
      <section ref={sectionRef} className="relative mx-auto mt-12 hidden max-w-6xl px-6 md:block">
        <div className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,auto)] gap-6">
          {/* Left: single rotating numbered circle, pinned, beneath the cards */}
          <div className="relative z-0">
            <div ref={circleBoundRef}>
              <div
                ref={circleStickyRef}
                className="sticky flex justify-start"
                style={{ top: "calc(50vh - min(215px, 25vw))" }}
              >
                <div
                  ref={circleRef}
                  className="relative aspect-square w-[min(431px,50vw)] shrink-0 will-change-transform"
                >
                  <svg viewBox="0 0 431 431" className="h-full w-full">
                    <circle
                      cx="215.5"
                      cy="215.5"
                      r="214"
                      fill="none"
                      strokeWidth="3"
                      style={{ stroke: active.color, transition: "stroke 0.4s ease" }}
                    />
                    <path
                      d={active.svgPath}
                      style={{ fill: active.color, transition: "fill 0.4s ease" }}
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Center: the three snap cards */}
          <div className="relative z-10 flex flex-col pt-[14vh] pb-[6vh]">
            {STEPS.map((step, i) => {
              const isActive = i === activeIndex;
              const mirror = i % 2 === 1;
              return (
                <Fragment key={step.n}>
                  <div
                    ref={(el) => {
                      cardRefs.current[i] = el;
                    }}
                    data-idx={i}
                    className={`relative snap-center overflow-hidden rounded-3xl p-8 text-[var(--brand-white)] transition-all duration-500 md:p-10 ${
                      isActive ? "scale-100 opacity-100" : "scale-[0.97] opacity-60"
                    } ${i === 2 ? "flex flex-col" : ""}`}
                    style={{
                      backgroundColor: step.color,
                      // card 3 dropped its second video (one wide video instead of two), which
                      // would otherwise shrink the card; pin it back to its prior height so the
                      // card size — and the arrow's stretch-mapped proportions — stay unchanged.
                      ...(i === 2 ? { minHeight: 548 } : {}),
                    }}
                  >
                    {/* Decorative cream flow-arrow — same shape on every card (the source
                        design drew each card's arrow slightly differently, which read as
                        inconsistent once built), stretched to fit the card's own box. */}
                    <svg
                      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
                      viewBox="0 0 686 682"
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      <path
                        d={cardArrowPath(i === 0 ? 317 : 140)}
                        className="fill-[var(--brand-white)] dark:fill-white"
                      />
                    </svg>
                    {/*
                      3-row, 2-col grid matching SVG card structure:
                      Row 1: textA (above its videoA column) | empty
                      Row 2: videoA | videoB (staggered down ~74% of video height via pt-[36%])
                      Row 3: textB (always bottom-left) | empty
                      Non-mirror: videoA right, videoB staggered left
                      Mirror:     videoA left, videoB staggered right
                    */}
                    <div
                      className={
                        i === 2
                          ? "relative z-10 flex flex-1 flex-col px-[5%]"
                          : "relative z-10 grid grid-cols-2 items-start gap-x-8 gap-y-6 px-[5%]"
                      }
                    >
                      {mirror ? (
                        <>
                          {/* mirror: textA top-left → videoA left → videoB staggered right → textB bottom-left */}
                          <p className="mono col-span-2 max-w-[26rem] pl-[6rem] text-xs uppercase leading-relaxed">
                            {step.textA}
                          </p>
                          <StepVideo
                            src={step.videoA}
                            className="w-full"
                            ref={(el) => {
                              videoRefs.current[i][0] = el;
                            }}
                          />
                          <div className="pt-[36%]">
                            <StepVideo
                              src={step.videoB!}
                              className="w-full"
                              ref={(el) => {
                                videoRefs.current[i][1] = el;
                              }}
                            />
                          </div>
                          <p className="mono col-span-2 max-w-[21rem] pl-[calc(6%+1rem)] text-xs uppercase leading-relaxed">
                            {step.textB}
                          </p>
                        </>
                      ) : i === 2 ? (
                        <>
                          {/* card 3: a single, wider video (design called for 2; replaced by
                              choice with one video spanning both columns) instead of the
                              videoA/videoB pair — card height is unchanged from this swap.
                              Flex column (not the shared grid) so the video can sit in a
                              flex-1 wrapper that centres it vertically in the leftover space,
                              which also pushes textB down toward the bottom of the card. */}
                          <p className="mono max-w-[26rem] pl-[6rem] text-xs uppercase leading-relaxed">
                            {step.textA}
                          </p>
                          <div className="flex flex-1 items-center justify-center">
                            <StepVideo
                              src={step.videoA}
                              aspectClassName="aspect-[2/1]"
                              className="w-full"
                              ref={(el) => {
                                videoRefs.current[i][0] = el;
                              }}
                            />
                          </div>
                          <p className="mono max-w-none pl-[calc(6%+1rem)] pr-0 text-xs uppercase leading-relaxed">
                            {step.textB}
                          </p>
                        </>
                      ) : (
                        <>
                          {/* non-mirror: textA top-right → videoA right → videoB staggered left → textB bottom-left */}
                          <p className="mono col-span-2 max-w-[34rem] pl-[calc(44%+1rem)] text-xs uppercase leading-relaxed">
                            {step.textA}
                          </p>
                          <div className="pt-[36%]">
                            <StepVideo
                              src={step.videoB!}
                              className="w-full"
                              ref={(el) => {
                                videoRefs.current[i][1] = el;
                              }}
                            />
                          </div>
                          <StepVideo
                            src={step.videoA}
                            className="w-full"
                            ref={(el) => {
                              videoRefs.current[i][0] = el;
                            }}
                          />
                          <p className="mono col-span-2 max-w-[21rem] pl-[calc(6%+1rem)] text-xs uppercase leading-relaxed">
                            {step.textB}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  {/* card-to-card connector: pure white bracket arrow + stub. */}
                  {i < STEPS.length - 1 && (
                    <div className="relative z-20" aria-hidden>
                      <svg
                        className="pointer-events-none absolute inset-x-0 top-1/2 w-full -translate-y-1/2"
                        style={{ aspectRatio: `686 / ${CONNECTORS[i].windowHeight}` }}
                        viewBox={`0 ${CONNECTORS[i].windowMinY} 686 ${CONNECTORS[i].windowHeight}`}
                        preserveAspectRatio="xMidYMid meet"
                      >
                        <path
                          d={CONNECTORS[i].arrowPath}
                          className="fill-[var(--brand-white)] dark:fill-white"
                        />
                        <path
                          d={CONNECTORS[i].strokePath}
                          className="stroke-[var(--brand-white)] dark:stroke-white"
                          fill="none"
                          strokeWidth="3"
                        />
                      </svg>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>

          {/* Right: sticky filter-chip section nav (each chip hugs its text) */}
          <div className="relative">
            <div ref={navBoundRef}>
              <nav
                ref={navRef}
                className="sticky flex flex-col items-start gap-2"
                style={{ top: "calc(50vh - 60px)" }}
              >
                {STEPS.map((step, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <button
                      key={step.n}
                      onClick={() => goToCard(i)}
                      className={`pill mono w-fit border-2 px-4 py-2 text-left text-[11px] uppercase tracking-wider transition ${
                        isActive ? NAV_CHIP[i].active : NAV_CHIP[i].idle
                      }`}
                    >
                      {step.navLabel}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* ── Mobile: stacked steps, each with a circle that sits underneath its card and
          spins as its section scrolls, landing upright at the section's end ── */}
      <section className="mt-12 flex flex-col gap-12 md:hidden">
        {STEPS.map((step, i) => {
          const mirror = i % 2 === 1;
          return (
            <div key={step.n}>
              <p
                className={`mono mb-4 text-xs uppercase tracking-wider ${mirror ? "pr-[6.5rem] text-right" : "pl-[6.5rem]"}`}
                style={{ color: step.color }}
              >
                {step.navLabel}
              </p>
              <div
                ref={(el) => {
                  mobileSectionRefs.current[i] = el;
                }}
                className="relative"
              >
                {/* Zero-footprint layer (doesn't push the card down) holding the sticky
                    circle — z-layered underneath the card (not vertically below it), fully
                    within the screen (no edge bleed). Extends slightly past the card's own
                    bottom edge (-bottom-6 vs. flush) so the circle settles a touch lower than
                    the card once it releases, instead of flush with the card's bottom. Real
                    CSS sticky works reliably here since nothing in this chain has overflow
                    set, so it resolves against the real page scroller: scrolls normally,
                    then pins at viewport middle — same `50vh` anchor the desktop circle
                    uses. */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 -bottom-6 z-0"
                  aria-hidden
                >
                  <div
                    ref={(el) => {
                      mobileCircleRefs.current[i] = el;
                    }}
                    className={`sticky -mt-6 h-20 w-20 will-change-transform ${
                      mirror ? "ml-auto mr-6" : "ml-6"
                    }`}
                    style={{ top: "calc(50vh - 2.5rem)" }}
                  >
                    <svg viewBox="0 0 431 431" className="h-full w-full">
                      <circle
                        cx="215.5"
                        cy="215.5"
                        r="214"
                        fill="none"
                        strokeWidth="3"
                        style={{ stroke: step.color }}
                      />
                      <path d={step.svgPath} style={{ fill: step.color }} />
                    </svg>
                  </div>
                </div>

                {/* Clips just the card's own slight off-screen bleed — scoped here (not on
                    the outer wrapper) so it doesn't become the sticky circle's containing
                    block and break its stickiness. */}
                <div className="overflow-hidden">
                  <div
                    className={`relative z-10 rounded-3xl p-6 text-[var(--brand-white)] ${
                      mirror ? "mr-20 -ml-3" : "ml-20 -mr-3"
                    }`}
                    style={{ backgroundColor: step.color }}
                  >
                    <p className="mono text-xs uppercase leading-relaxed">{step.textA}</p>
                    <StepVideo
                      src={step.videoA}
                      aspectClassName={i === 2 ? "aspect-[2/1]" : "aspect-square"}
                      className="mt-4 w-full"
                      ref={(el) => {
                        mobileVideoRefs.current[i][0] = el;
                      }}
                    />
                    <p className="mono mt-6 text-xs uppercase leading-relaxed">{step.textB}</p>
                    {step.videoB && (
                      <StepVideo
                        src={step.videoB}
                        className="mt-4 w-full"
                        ref={(el) => {
                          mobileVideoRefs.current[i][1] = el;
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Closing label (desktop only) + back to top ── */}
      <div className="mx-auto mt-8 flex flex-col items-center gap-6 px-6 text-center">
        <p className="mono uppercase hidden max-w-3xl text-xs leading-relaxed tracking-wider text-muted-foreground md:block">
          Now that you've got the basics, start using it, play around with the settings and use it
          for your next gathering! If you have any feedback, please send it to me through{" "}
          <Link to="/feedback" className="underline transition-opacity hover:opacity-60">
            here
          </Link>
          .
        </p>
        <BackToTop />
      </div>

      {/* ── Partnership band + slim footer (one continuous blue band) ── */}
      <section className="mt-24 bg-[var(--brand-blue)] text-[var(--brand-white)]">
        <div className="mx-auto max-w-6xl px-10 py-14 text-center md:px-6">
          <h2 className="mx-auto max-w-none text-3xl leading-tight md:text-5xl">
            This project will always be free and open source.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-[var(--brand-white)]/85 md:text-lg">
            If you feel God's prompting, I invite you to partner with me financially by giving
            generously and cheerfully!
          </p>
          <div className="mt-10 flex flex-col items-stretch gap-4 md:flex-row md:flex-wrap md:items-center md:justify-center">
            <a
              href="/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="pill flex items-center justify-between gap-3 border border-[var(--brand-white)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
            >
              Donate <ArrowUpRight className="size-[1em]" />
            </a>
            <Link
              to="/about"
              className="pill flex items-center justify-between gap-3 border border-[var(--brand-white)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
            >
              About <ArrowUpRight className="size-[1em]" />
            </Link>
            <a
              href="https://www.instagram.com/phyto.live"
              target="_blank"
              rel="noopener noreferrer"
              className="pill flex items-center justify-between gap-3 border border-[var(--brand-white)] px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-[var(--brand-white)] transition hover:bg-[var(--brand-white)] hover:text-[var(--brand-blue)]"
            >
              Instagram <ArrowUpRight className="size-[1em]" />
            </a>
          </div>
        </div>

        {/* slim footer row */}
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-10 py-8 md:flex-row md:items-center md:justify-between md:px-6">
          <nav className="flex items-center gap-6 text-xs">
            <Link to="/feedback" className={linkCls}>
              Feedback
            </Link>
            <Link to="/updates" className={linkCls}>
              {isTest ? "Test Notes" : "Updates"}
            </Link>
          </nav>
          <nav className="flex items-center gap-6 text-xs">
            <Link to="/legal" className={`${linkCls} whitespace-nowrap`}>
              Legal
            </Link>
            <a
              href="https://github.com/studio-liturgy"
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkCls} whitespace-nowrap`}
            >
              Source
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </section>
    </main>
  );
}
