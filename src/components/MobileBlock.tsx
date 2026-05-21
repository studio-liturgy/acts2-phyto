import { Link, useLocation } from "@tanstack/react-router";
import wordmark from "@/assets/wordmark.svg";

const linkCls = "transition-opacity duration-200 hover:opacity-60";

// Routes that remain viewable on mobile (informational pages).
const MOBILE_ALLOWED = ["/about", "/change-log", "/terms", "/privacy"];

/**
 * Shown only on small screens (<md). Blocks the app on mobile and
 * presents a minimal set of links. Hidden on informational routes.
 */
export function MobileBlock() {
  const { pathname } = useLocation();
  if (MOBILE_ALLOWED.includes(pathname)) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-16 bg-[var(--brand-blue)] px-6 text-center text-[var(--brand-white)] md:hidden">
      <img src={wordmark} alt="phyto" className="h-28 w-auto" />
      <nav className="flex flex-col items-center gap-3 text-xl">
        <Link to="/about" className={linkCls}>About</Link>
        <a href="https://www.instagram.com/phyto.live" target="_blank" rel="noopener noreferrer" className={linkCls}>Instagram</a>
        <a href="https://ko-fi.com/valiantchan" target="_blank" rel="noopener noreferrer" className={linkCls}>Donate</a>
        <Link to="/change-log" className={linkCls}>Change Log</Link>
        <Link to="/terms" className={linkCls}>Terms of Use</Link>
        <Link to="/privacy" className={linkCls}>Privacy Policy</Link>
      </nav>
    </div>
  );
}
