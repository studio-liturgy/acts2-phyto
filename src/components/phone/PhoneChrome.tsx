import { Link, Navigate } from "@tanstack/react-router";
import { ArrowUpLeft, ChevronDown, Layers, Library, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { PhoneTab } from "@/lib/phone-layout";
import { caretAtPoint, revealDelta } from "@/lib/phone-dock";
import { lineHold } from "@/lib/line-select";
import { useAuthStore } from "@/lib/authStore";

/**
 * A phone screen: header, the scrolling body, and (on the main screens) the
 * bottom tab bar. Fills the visible viewport so the bars stay put while the
 * body scrolls.
 */
export function PhoneScreen({
  header,
  children,
  tab,
  bodyClassName = "",
  scroll = true,
  overlay,
}: {
  /** Floats over the body, fixed while it scrolls (the arrangement button). */
  overlay?: ReactNode;
  /** False: the body fills the space without scrolling (a view that scrolls itself). */
  scroll?: boolean;
  header?: ReactNode;
  children: ReactNode;
  /** The tab bar's selected tab; absent = no tab bar (the set editor). */
  tab?: PhoneTab;
  bodyClassName?: string;
}) {
  useNoInputZoom();
  // Signed out, a phone shows only the intro (sign in to edit anything).
  const signedOut = useAuthStore((s) => !s.isLoading && s.session === null);
  if (signedOut) return <Navigate to="/" search={{}} replace />;
  return (
    // --vvh: the part of the screen above the keyboard, while typing in an
    // editor (useKeyboardInset).
    <div className="flex h-[var(--vvh,100dvh)] translate-y-[var(--vvt,0px)] flex-col overflow-hidden bg-background text-foreground">
      {header}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={`min-h-0 flex-1 ${scroll ? "overflow-y-auto overscroll-contain" : "overflow-hidden"} ${bodyClassName}`}
        >
          {children}
        </div>
        {overlay}
      </div>
      {tab && <PhoneTabBar tab={tab} />}
    </div>
  );
}

/**
 * iPhones zoom the page into any text box under 16px when it's tapped, and
 * the editors' boxes are smaller than that. A maximum scale stops the jump
 * (pinch zoom still works on iOS). iOS only: on Android it would block
 * pinch zoom, and Android doesn't jump anyway.
 */
function useNoInputZoom() {
  useEffect(() => {
    if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const prev = meta.getAttribute("content") ?? "";
    if (!prev.includes("maximum-scale")) meta.setAttribute("content", `${prev}, maximum-scale=1`);
    return () => meta.setAttribute("content", prev);
  }, []);
}

/** A main screen's header: the big title like the desktop home, actions on the right. */
export function PhoneTitleHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-center gap-2 px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <h1 className="min-w-0 flex-1 truncate text-4xl leading-tight">{title}</h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A pushed screen's header: the back button, the title, actions on the right. */
export function PhoneBackHeader({
  back,
  title,
  actions,
  border = true,
}: {
  /** Where Back goes (a path with its search, e.g. "/?tab=catalogue");
   *  null for no Back. */
  back: string | null;
  title: ReactNode;
  actions?: ReactNode;
  border?: boolean;
}) {
  return (
    <header
      className={`flex shrink-0 items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${
        border ? "border-b border-foreground" : ""
      }`}
    >
      {back !== null && (
        <Link
          to={back}
          className="pill flex h-9 w-9 shrink-0 items-center justify-center bg-foreground text-background transition active:opacity-80"
          title="Back"
          aria-label="Back"
        >
          <ArrowUpLeft className="h-5 w-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">{title}</div>
      {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
    </header>
  );
}

const TABS: { tab: PhoneTab; label: string; Icon: typeof Library }[] = [
  { tab: "gatherings", label: "Gatherings", Icon: Layers },
  { tab: "catalogue", label: "Catalogue", Icon: Library },
  { tab: "settings", label: "Settings", Icon: Settings },
];

/** Icon-only tab bar along the bottom edge, like the Shiro app's. */
export function PhoneTabBar({ tab }: { tab: PhoneTab }) {
  return (
    <nav className="flex shrink-0 border-t border-foreground/15 bg-background px-1.5 pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ tab: t, label, Icon }) => (
        <Link
          key={t}
          to="/"
          search={{ tab: t }}
          className={`relative flex h-[54px] flex-1 items-center justify-center transition-colors ${
            tab === t ? "text-foreground" : "text-foreground/35"
          }`}
          aria-label={label}
          aria-current={tab === t ? "page" : undefined}
        >
          <Icon className="h-[23px] w-[23px]" strokeWidth={1.5} />
        </Link>
      ))}
    </nav>
  );
}

/**
 * A phone editor's importer that folds away, like the Song Template and
 * Background cards: a title row with a chevron, and the body sliding open or
 * shut beneath it (pushing the editor below up or down). Sits inside the
 * importer's own padded box. Clips only while shut, so the importer's
 * dropdowns can spill out while it's open.
 */
export function PhoneFold({
  enabled = true,
  title,
  open,
  onToggle,
  hideTitle = false,
  children,
}: {
  /** False (the desktop): just the children, no fold. */
  enabled?: boolean;
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Its title lives in a PhoneFoldTabs row instead: only the body folds. */
  hideTitle?: boolean;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <div>
      {!hideTitle && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`mono flex w-full items-center justify-between text-[10px] uppercase leading-5 tracking-wider text-muted-foreground transition-[padding] duration-200 ${open ? "pb-2" : ""}`}
        >
          <span>{title}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}
      {/* One column held to the box's width (minmax 0), so a long unbroken
          line inside (a song title in the search results) truncates instead
          of widening the whole box past the screen. */}
      <div
        className={`grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className={`min-h-0 min-w-0 ${open ? "" : "overflow-hidden"}`}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Fold titles side by side (the song editor's Settings and Chords): each
 * takes an equal share of the row, and the open one's body (a `PhoneFold
 * hideTitle` below the row) slides out across the full width. One alone
 * fills the row.
 */
export function PhoneFoldTabs({
  tabs,
}: {
  tabs: { title: string; open: boolean; onToggle: () => void }[];
}) {
  const anyOpen = tabs.some((t) => t.open);
  return (
    <div className={`flex gap-x-5 transition-[padding] duration-200 ${anyOpen ? "pb-2" : ""}`}>
      {tabs.map((t) => (
        <button
          key={t.title}
          type="button"
          onClick={t.onToggle}
          aria-expanded={t.open}
          className="mono flex min-w-0 flex-1 items-center justify-between text-[10px] uppercase leading-5 tracking-wider text-muted-foreground"
        >
          <span>{t.title}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${t.open ? "rotate-180" : ""}`}
          />
        </button>
      ))}
    </div>
  );
}

// The keyboard's height the last time it was up (0 until then): where it will
// come up again, for placing a tapped line above it before it does.
let lastKeyboard = 0;

/**
 * How much of the screen the on-screen keyboard covers (px; 0 when it's down).
 *
 * iOS shows a focused box by sliding the whole page up under the keyboard.
 * Pulling it back every frame fought that slide (the page jumped down and back
 * on each tap, and juddered at the bottom of a grid). Instead, while typing in
 * an editor the screen itself shrinks to the part above the keyboard (--vvh on
 * <html>, read by PhoneScreen; the editor tabs hide via data-kb), so every
 * line is reachable by the editor's own scrolling and iOS has nothing to
 * slide. The page is only put back at the top if iOS slid it anyway.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let last = -1;
    let frame = 0;
    const typingIn = (): HTMLElement | null => {
      const el = document.activeElement;
      if (
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLInputElement && el.type !== "checkbox") ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return el.closest(".has-dock") ? (el as HTMLElement) : null;
      }
      return null;
    };
    // The focused box above the keyboard and the dock, by its own scroller.
    const reveal = () => {
      const el = typingIn();
      const box = el?.closest<HTMLElement>("[data-editor-scroll]");
      if (!el || !box) return;
      const r = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const bottom = Math.min(b.bottom, vv.height) - 64;
      if (r.bottom > bottom) box.scrollTop += r.bottom - bottom;
      else if (r.top < b.top + 8) box.scrollTop -= b.top + 8 - r.top;
    };
    let lastH = -1;
    const read = () => {
      const el = typingIn();
      const covered = window.innerHeight - vv.height;
      const next = el && covered > 80 ? Math.round(covered) : 0;
      const h = next > 0 ? Math.round(vv.height) : 0;
      // Wherever iOS pans the view to show the tapped line, the screen moves
      // with it, so nothing on it appears to jump.
      root.style.setProperty("--vvt", `${h > 0 ? Math.round(vv.offsetTop) : 0}px`);
      if (h !== lastH) {
        lastH = h;
        if (h > 0) {
          root.style.setProperty("--vvh", `${h}px`);
          root.setAttribute("data-kb", "");
        } else {
          root.style.removeProperty("--vvh");
          root.removeAttribute("data-kb");
        }
      }
      if (next !== last) {
        last = next;
        if (next > 0) lastKeyboard = next;
        setInset(next);
        if (next > 0) requestAnimationFrame(reveal);
      }
    };
    // If iOS slid the page anyway, settle it back once (not every frame).
    const onScroll = () => {
      if (typingIn() && window.scrollY !== 0) window.scrollTo(0, 0);
      start();
    };
    const loop = () => {
      read();
      frame = typingIn() || last > 0 ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };
    const onFocus = () => {
      start();
      // Switching boxes with the keyboard already up.
      setTimeout(reveal, 60);
    };
    read();
    // A tap on a line we place ourselves: no focus scroll from iOS. Scroll
    // the editor first if the keyboard would cover the line (it then sits
    // at the editor's top), then focus without scrolling and put the caret
    // where the finger was. A long press or a drag is left to iOS.
    let touch: { x: number; y: number; t: number } | null = null;
    const tapTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return null;
      if (t instanceof HTMLInputElement && t.type !== "text" && t.type !== "search") return null;
      if (t.disabled || t.readOnly || t === document.activeElement) return null;
      return t.closest(".has-dock [data-editor-scroll]") ? t : null;
    };
    const onTouchStart = (e: TouchEvent) => {
      const p = e.touches[0];
      touch =
        e.touches.length === 1 && tapTarget(e.target)
          ? { x: p.clientX, y: p.clientY, t: Date.now() }
          : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t0 = touch;
      touch = null;
      // The lift after a press-and-hold line pick isn't a tap on the line.
      if (lineHold.active) return;
      const el = tapTarget(e.target);
      const p = e.changedTouches[0];
      if (!t0 || !el || !p) return;
      if (Math.hypot(p.clientX - t0.x, p.clientY - t0.y) > 10) return;
      if (Date.now() - t0.t > 450) return;
      e.preventDefault();
      const caret = caretAtPoint(el, p.clientX, p.clientY);
      const box = el.closest<HTMLElement>("[data-editor-scroll]");
      if (box) {
        const up = last > 0;
        const kb = up ? 0 : lastKeyboard || Math.round(window.innerHeight * 0.45);
        const delta = revealDelta(
          el.getBoundingClientRect(),
          box.getBoundingClientRect().top,
          up ? vv.height : window.innerHeight,
          kb,
        );
        if (delta) box.scrollTop += delta;
      }
      el.focus({ preventScroll: true });
      el.setSelectionRange(caret, caret);
      start();
    };
    vv.addEventListener("resize", start);
    vv.addEventListener("scroll", onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", start);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      vv.removeEventListener("resize", start);
      vv.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", start);
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
      root.removeAttribute("data-kb");
    };
  }, []);
  return inset;
}

/**
 * A phone editor's secondary bar: its add buttons as icons, in the top half
 * of a rounded rectangle sitting on the editor tabs (not full width). It
 * floats over the editor, so only the rounded tab shows; the editor's
 * scroller (data-editor-scroll) gets room beneath via `.has-dock` (styles.css).
 * Put `has-dock relative` on the editor. `slotRef` lets an editor portal in.
 */
export function PhoneDock({
  children,
  slotRef,
}: {
  children?: ReactNode;
  slotRef?: (el: HTMLDivElement | null) => void;
}) {
  // With the keyboard up the screen ends at the keyboard (and the editor tabs
  // hide), so the dock's spot at the editor's foot sits right on top of it.
  useKeyboardInset();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center">
      <div
        ref={slotRef}
        className="pointer-events-auto flex items-center gap-0.5 rounded-t-2xl border border-b-0 border-foreground/30 bg-background px-2 pt-1 empty:hidden"
      >
        {children}
      </div>
    </div>
  );
}
