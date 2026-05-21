import { Link } from "@tanstack/react-router";
import wordmark from "@/assets/wordmark.svg";
import { ThemeToggle } from "@/components/ThemeToggle";



const linkCls = "transition-opacity duration-200 hover:opacity-60";

export function Footer() {
  return (
    <footer className="mt-20 bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <div className="mx-auto grid max-w-6xl grid-cols-3 items-center gap-4 px-6 py-8">
        <nav className="flex items-center gap-6 text-sm">
          <Link to="/about" className={linkCls}>About</Link>
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className={linkCls}>Instagram</a>
          <a href="https://donate.example.com" target="_blank" rel="noopener noreferrer" className={linkCls}>Donate</a>
          <Link to="/feedback" className={linkCls}>Feedback</Link>
        </nav>
        <div className="flex justify-center">
          <Link to="/">
            <img src={wordmark} alt="phyto" className="h-12 w-auto" />
          </Link>
        </div>
        <nav className="flex items-center justify-end gap-4 text-sm flex-nowrap">
          <Link to="/change-log" className={`${linkCls} whitespace-nowrap`}>Change Log</Link>
          <Link to="/terms" className={`${linkCls} whitespace-nowrap`}>Terms of Use</Link>
          <Link to="/privacy" className={`${linkCls} whitespace-nowrap`}>Privacy Policy</Link>
          <ThemeToggle />
        </nav>
      </div>
    </footer>
  );
}
