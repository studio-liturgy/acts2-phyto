import { Link } from "@tanstack/react-router";
import wordmark from "@/assets/wordmark.svg";
import wordmarkTest from "@/assets/wordmark-test.svg";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const linkCls = "mono uppercase transition-opacity duration-200 hover:opacity-60";
const isTest = import.meta.env.VITE_APP_ENV === 'test';

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("mt-20 hidden bg-[var(--brand-blue)] text-[var(--brand-white)] md:block", className)}>
      <div className="mx-auto grid max-w-6xl grid-cols-3 items-center gap-4 px-6 py-8">
        <nav className="flex items-center gap-6 text-xs">
          <Link to="/about" className={linkCls}>About</Link>
          <a href="https://www.instagram.com/phyto.live" target="_blank" rel="noopener noreferrer" className={linkCls}>Instagram</a>
          <a href="https://ko-fi.com/valiantchan" target="_blank" rel="noopener noreferrer" className={linkCls}>Donate</a>
          <Link to="/feedback" className={linkCls}>Feedback</Link>
        </nav>
        <div className="flex justify-center">
          <Link to="/">
            <img src={isTest ? wordmarkTest : wordmark} alt={isTest ? 'phytoexp' : 'phyto'} className="h-12 w-auto" />
          </Link>
        </div>
        <nav className="flex items-center justify-end gap-6 text-xs flex-nowrap">
          <a href="https://github.com/studio-liturgy" target="_blank" rel="noopener noreferrer" className={`${linkCls} whitespace-nowrap`}>Source</a>
          <Link to="/updates" className={`${linkCls} whitespace-nowrap`}>{isTest ? 'Test Notes' : 'Updates'}</Link>
          <Link to="/legal" className={`${linkCls} whitespace-nowrap`}>Legal</Link>
          <ThemeToggle />
        </nav>
      </div>
    </footer>
  );
}
