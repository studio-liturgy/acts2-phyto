import { createFileRoute, Link } from "@tanstack/react-router";
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono text-xs uppercase tracking-wider underline">← Back</Link>
        <h1 className="mt-6 text-5xl">Terms of Use</h1>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Placeholder terms of use content.
        </p>
      </main>
      <Footer />
    </div>
  );
}
