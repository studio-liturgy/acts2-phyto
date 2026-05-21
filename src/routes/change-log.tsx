import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

export const Route = createFileRoute("/change-log")({
  head: () => ({
    meta: [
      { title: "Change Log — phyto" },
      { name: "description", content: "Release notes for phyto." },
      { property: "og:title", content: "Change Log — phyto" },
      { property: "og:description", content: "Release notes for phyto." },
      { property: "og:url", content: "https://phyto.live/change-log" },
    ],
    links: [
      { rel: "canonical", href: "https://phyto.live/change-log" },
    ],
  }),
  component: ChangeLog,
});

function ChangeLog() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"><ArrowLeft className="h-3 w-3" /> BACK</Link>
        <h1 className="mt-6 text-5xl">Change Log</h1>
        <ul className="mt-8 space-y-6">
          <li>
            <div className="mono text-xs uppercase tracking-wider opacity-80">Releasing beta for test users.</div>
            <p className="mt-1">MAY 21, 2026</p>
          </li>
        </ul>
        <div className="mt-12">
          <BackToTop />
        </div>
      </main>
      <Footer />
    </div>
  );
}
