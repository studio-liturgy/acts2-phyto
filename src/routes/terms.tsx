import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — phyto" },
      { name: "description", content: "Terms of use for phyto." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"><ArrowLeft className="h-3 w-3" /> Back</Link>
        <h1 className="mt-6 text-5xl">Terms of Use</h1>
        <p className="mt-6 text-base leading-relaxed opacity-90">
          Placeholder terms of use content.
        </p>
      </main>
      <Footer />
    </div>
  );
}
