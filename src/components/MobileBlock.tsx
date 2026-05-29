import { Link, useLocation } from "@tanstack/react-router";
import wordmark from "@/assets/wordmark.svg";

const linkCls = "transition-opacity duration-200 hover:opacity-60";

const EXACT_ALLOWED = ["/about", "/updates", "/terms", "/privacy", "/feedback", "/auth/callback"];
const PREFIX_ALLOWED = ["/g/"];

// Supports exact paths and prefix patterns. __root.tsx calls MOBILE_ALLOWED.includes(pathname).
export const MOBILE_ALLOWED = {
  includes: (pathname: string) =>
    EXACT_ALLOWED.includes(pathname) ||
    PREFIX_ALLOWED.some((p) => pathname.startsWith(p)),
};

/**
 * Shown only on small screens (<md). Blocks the app on mobile and
 * presents a minimal set of links. Hidden on informational routes.
 */
export function MobileBlock() {
  const { pathname } = useLocation();
  if (MOBILE_ALLOWED.includes(pathname)) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-16 bg-[var(--brand-blue)] px-6 text-center text-[var(--brand-white)] md:hidden">
      <div className="flex flex-col items-center gap-8">
        <img src={wordmark} alt="phyto" className="h-28 w-auto" />
        <p className="mono max-w-[260px] text-sm leading-snug opacity-70">
          We're currently working on a mobile version, stay tuned!
        </p>
      </div>
      <nav className="flex flex-col items-center gap-3 text-xl">
        <Link to="/about" className={linkCls}>About</Link>
        <a href="https://www.instagram.com/phyto.live" target="_blank" rel="noopener noreferrer" className={linkCls}>Instagram</a>
        <a href="https://ko-fi.com/valiantchan" target="_blank" rel="noopener noreferrer" className={linkCls}>Donate</a>
        <Link to="/feedback" className={linkCls}>Feedback</Link>
        <Link to="/updates" className={linkCls}>Updates</Link>
        <Link to="/terms" className={linkCls}>Terms of Use</Link>
        <Link to="/privacy" className={linkCls}>Privacy Policy</Link>
      </nav>
    </div>
  );
}
