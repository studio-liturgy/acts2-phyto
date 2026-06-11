import { Link } from "@tanstack/react-router";
import wordmark from "@/assets/wordmark.svg";
import wordmarkTestBlack from "@/assets/wordmark-test-black.svg";
import { useRootBackground } from "@/hooks/use-root-background";

const isTest = import.meta.env.VITE_APP_ENV === 'test';
const linkCls = "transition-opacity duration-200 hover:opacity-60";

const EXACT_ALLOWED = ["/about", "/updates", "/legal", "/feedback", "/auth/callback", "/output"];
const PREFIX_ALLOWED = ["/g/"];

// Supports exact paths and prefix patterns. __root.tsx calls MOBILE_ALLOWED.includes(pathname).
export const MOBILE_ALLOWED = {
  includes: (pathname: string) =>
    EXACT_ALLOWED.includes(pathname) ||
    PREFIX_ALLOWED.some((p) => pathname.startsWith(p)),
};

/**
 * Full-screen overlay that blocks the app on mobile. Rendered only when the
 * parent determines it should show — no internal location or breakpoint checks.
 */
export function MobileBlock() {
  // On the test build, paint the login image onto the document root so the
  // device's safe-area / overscroll zones show a seamless continuation of the
  // mobile-block background instead of the cream page background ("white bars").
  useRootBackground(isTest && "url('/login-bg-or.jpg') center/cover");

  return (
    <div
      className={`fixed inset-0 z-[100] min-h-[110vh] flex flex-col items-center justify-center gap-8 px-6 text-center ${isTest ? 'bg-cover bg-center text-[var(--brand-black)]' : 'bg-[var(--brand-blue)] text-[var(--brand-white)]'}`}
      style={isTest ? { backgroundImage: "url('/login-bg-or.jpg')" } : undefined}
    >
      <img src={isTest ? wordmarkTestBlack : wordmark} alt={isTest ? 'phytoexp' : 'phyto'} className="h-28 w-auto" />
      <p className="my-8 max-w-[260px] text-sm leading-relaxed opacity-70">
        Currently working on a mobile version, stay tuned!
      </p>
      <nav className="mono uppercase flex flex-col items-center gap-3 text-sm">
        <Link to="/about" className={linkCls}>About</Link>
        <a href="https://www.instagram.com/phyto.live" target="_blank" rel="noopener noreferrer" className={linkCls}>Instagram</a>
        <a href="https://ko-fi.com/valiantchan" target="_blank" rel="noopener noreferrer" className={linkCls}>Donate</a>
        <Link to="/feedback" className={linkCls}>Feedback</Link>
        <Link to="/updates" className={linkCls}>{isTest ? 'Test Notes' : 'Updates'}</Link>
        <Link to="/legal" className={linkCls}>Legal</Link>
      </nav>
    </div>
  );
}
