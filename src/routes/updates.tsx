import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

export const Route = createFileRoute("/updates")({
  head: () => ({
    meta: [
      { title: "Updates | phyto" },
      { name: "description", content: "Release notes and updates for phyto." },
      { property: "og:title", content: "Updates | phyto" },
      { property: "og:description", content: "Release notes and updates for phyto." },
      { property: "og:url", content: "https://phyto.live/updates" },
    ],
    links: [
      { rel: "canonical", href: "https://phyto.live/updates" },
    ],
  }),
  component: Updates,
});

function Updates() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"><ArrowLeft className="h-3 w-3" /> BACK</Link>
        <h1 className="mt-6 text-5xl">Updates</h1>
        <ul className="mt-8 space-y-6">
          <li>
            <div className="mono text-xs uppercase tracking-wider opacity-80">MAY 28, 2026</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Reviewed and adjusted all copy for coherence</li>
              <li>Removed password and publicized GitHub repo. The app is now completely free and open source!</li>
            </ul>
          </li>
          <li>
            <div className="mono text-xs uppercase tracking-wider opacity-80">MAY 21, 2026</div>
            <p className="mt-1">Released beta for test users.</p>
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
