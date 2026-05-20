import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/change-log")({
  head: () => ({
    meta: [
      { title: "Change Log — phyto" },
      { name: "description", content: "Release notes for phyto." },
    ],
  }),
  component: ChangeLog,
});

function ChangeLog() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono text-xs uppercase tracking-wider underline">← Back</Link>
        <h1 className="mt-6 text-5xl">Change Log</h1>
        <ul className="mt-8 space-y-6">
          <li>
            <div className="mono text-xs uppercase tracking-wider text-muted-foreground">May 2026</div>
            <p className="mt-1">New visual design system: brand palette, Space Mono, pill UI.</p>
          </li>
        </ul>
      </main>
      <Footer />
    </div>
  );
}
