import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — phyto" },
      { name: "description", content: "Privacy policy for phyto." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60">← Back</Link>
        <h1 className="mt-6 text-5xl">Privacy Policy</h1>
        <p className="mt-6 text-base leading-relaxed opacity-90">
          Placeholder privacy policy content. All app data is stored locally in your browser.
        </p>
      </main>
      <Footer />
    </div>
  );
}
