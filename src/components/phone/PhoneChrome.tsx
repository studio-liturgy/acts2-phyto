import { Link, Navigate } from "@tanstack/react-router";
import { ArrowUpLeft, ChevronDown, Layers, Library, Settings } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { PhoneTab } from "@/lib/phone-layout";
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
}: {
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {header}
      <div
        className={`min-h-0 flex-1 ${scroll ? "overflow-y-auto overscroll-contain" : "overflow-hidden"} ${bodyClassName}`}
      >
        {children}
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
  /** Where Back goes (a path with its search, e.g. "/?tab=catalogue"). */
  back: string;
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
      <Link
        to={back}
        className="pill flex h-9 w-9 shrink-0 items-center justify-center bg-foreground text-background transition active:opacity-80"
        title="Back"
        aria-label="Back"
      >
        <ArrowUpLeft className="h-5 w-5" />
      </Link>
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
          search={t === "gatherings" ? {} : { tab: t }}
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
  children,
}: {
  /** False (the desktop): just the children, no fold. */
  enabled?: boolean;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <div>
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
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className={`min-h-0 ${open ? "" : "overflow-hidden"}`}>{children}</div>
      </div>
    </div>
  );
}
