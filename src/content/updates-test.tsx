import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

export default function UpdatesTest() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"><ArrowLeft className="h-3 w-3" /> BACK</Link>
        <h1 className="mt-6 text-5xl">Test Notes</h1>
        <p className="mono mt-2 text-xs uppercase tracking-wider opacity-70">phytoexp.live — experimental environment</p>
        <ul className="mt-8 space-y-8">
          <li>
            <div className="mono text-xs uppercase tracking-wider opacity-80">Features Being Tested</div>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {/* Add features currently under test here */}
            </ul>
          </li>
          <li>
            <div className="mono text-xs uppercase tracking-wider opacity-80">Known Issues</div>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {/* Add known issues here */}
            </ul>
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
