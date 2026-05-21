import { useEffect, useState, type FormEvent } from "react";
import wordmark from "@/assets/wordmark.svg";

const STORAGE_KEY = "phyto-site-access";
const PASSWORD = "acts24247";

export function SitePasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1" || localStorage.getItem(STORAGE_KEY) === "1") {
        setUnlocked(true);
      }
    } catch {}
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  if (unlocked) return <>{children}</>;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() === PASSWORD) {
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {}
      setUnlocked(true);
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--brand-blue)] px-6 text-[var(--brand-white)]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6 text-center">
        <img src={wordmark} alt="phyto" className="mx-auto h-16 w-auto" />
        <p className="mono text-xs uppercase tracking-wider opacity-80">Enter password to continue</p>
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          placeholder="Password"
          className="mono w-full rounded-full border-2 border-[var(--brand-white)] bg-transparent px-5 py-3 text-center text-sm text-[var(--brand-white)] placeholder:text-[var(--brand-white)]/60 outline-none focus:ring-2 focus:ring-[var(--brand-white)]/40"
        />
        {error && (
          <p className="mono text-xs uppercase tracking-wider text-[var(--brand-white)]">Incorrect password</p>
        )}
        <button
          type="submit"
          className="pill mono w-full bg-[var(--brand-white)] px-6 py-3 text-sm uppercase tracking-wider text-[var(--brand-blue)] transition-opacity hover:opacity-90"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
