import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="mt-20 bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <div className="mx-auto grid max-w-6xl grid-cols-3 items-center gap-4 px-6 py-8">
        <nav className="flex gap-6 text-sm">
          <Link to="/about" className="hover:underline">About</Link>
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Instagram</a>
          <a href="https://donate.example.com" target="_blank" rel="noopener noreferrer" className="hover:underline">Donate</a>
        </nav>
        <div className="flex justify-center">
          {/* phyto wordmark placeholder — replace with uploaded asset */}
          <span className="text-3xl italic" style={{ fontFamily: "'Brush Script MT', cursive" }}>
            phyto
          </span>
        </div>
        <nav className="flex justify-end gap-6 text-sm">
          <Link to="/change-log" className="hover:underline">Change Log</Link>
          <Link to="/terms" className="hover:underline">Terms of Use</Link>
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
        </nav>
      </div>
    </footer>
  );
}
