import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";

const isTest = import.meta.env.VITE_APP_ENV === "test";
const accent = isTest ? "var(--brand-orange)" : "var(--brand-blue)";

function LegalPill({
  to,
  active,
  children,
}: {
  to: "/terms" | "/privacy";
  active: boolean;
  children: ReactNode;
}) {
  const base =
    "mono pill rounded-full border-2 border-white px-4 py-1.5 text-xs uppercase tracking-wider transition";
  const cls = active
    ? `${base} bg-white shadow-none`
    : `${base} bg-transparent text-white hover:bg-white`;
  return (
    <Link
      to={to}
      className={cls}
      style={active ? { color: accent } : undefined}
      // Match the tab hover: text takes the accent color when the pill fills white.
      onMouseEnter={(e) => !active && (e.currentTarget.style.color = accent)}
      onMouseLeave={(e) => !active && (e.currentTarget.style.color = "")}
    >
      {children}
    </Link>
  );
}

/** Shared chrome for the standalone Terms and Privacy pages (formerly the tabbed
 *  `/legal` page). `active` styles the matching pill and the two pills link across
 *  to each other so the docs stay one click apart. */
export function LegalLayout({
  active,
  children,
}: {
  active: "terms" | "privacy";
  children: ReactNode;
}) {
  usePageBackgroundColor(isTest ? "var(--brand-orange-dark)" : "var(--brand-blue)");

  return (
    <div
      className={`flex min-h-screen flex-col ${isTest ? "bg-[var(--brand-orange-dark)]" : "bg-[var(--brand-blue)]"} text-[var(--brand-white)]`}
    >
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link
          to="/"
          className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-3 w-3" /> BACK
        </Link>
        <h1 className="mt-6 text-5xl">Legal</h1>

        <div className="mt-8 flex gap-2">
          <LegalPill to="/terms" active={active === "terms"}>
            Terms of Use
          </LegalPill>
          <LegalPill to="/privacy" active={active === "privacy"}>
            Privacy Policy
          </LegalPill>
        </div>

        <div className="mt-3">{children}</div>

        <div className="mt-12">
          <BackToTop />
        </div>
      </main>
      <Footer />
    </div>
  );
}
