import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — phyto" },
      { name: "description", content: "About phyto: build sets, group them into gatherings, and present live." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono text-xs uppercase tracking-wider underline">← Back</Link>
        <h1 className="mt-6 text-5xl">About</h1>
        <p className="mt-6 text-base leading-relaxed">
          phyto is a lightweight presentation tool for worship gatherings. Build sets of songs,
          scripture, and media — group them into gatherings — and present them live.
        </p>
      </main>
      <Footer />
    </div>
  );
}
