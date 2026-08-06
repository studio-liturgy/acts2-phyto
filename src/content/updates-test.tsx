import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, AlertTriangle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";

function FeatureItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Plus className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
      <div className="flex-1">{children}</div>
    </li>
  );
}

export default function UpdatesTest() {
  usePageBackgroundColor("var(--brand-orange-dark)");
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-orange-dark)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link
          to="/"
          className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-3 w-3" /> BACK
        </Link>
        <h1 className="mt-6 text-5xl">Test Notes</h1>
        <ul className="mt-8 space-y-8">
          <li>
            <div className="mono text-xs uppercase tracking-wider opacity-80">Known Issues</div>
            <ul className="mt-3 space-y-1">
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
                <div className="flex-1">
                  Stray dashes still appear in a few imported songs, where a word was split across a
                  chord change. Underscores are fixed
                </div>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
                <div className="flex-1">Welcome email not sending on first login</div>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
                <div className="flex-1">Assets in emails not showing</div>
              </li>
            </ul>
          </li>
          <li>
            <div className="mono text-xs uppercase tracking-wider opacity-80">
              Features Being Tested
            </div>
            <ul className="mt-3 space-y-1">
              <FeatureItem>
                Chords on songs
                <ul className="mt-1 space-y-1 pl-2">
                  <FeatureItem>Chords on a row above the words, never on the projector</FeatureItem>
                  <FeatureItem>Showing chords on phones from the gathering menu</FeatureItem>
                  <FeatureItem>Chord letters, Nashville numbers, and transposing</FeatureItem>
                  <FeatureItem>
                    Pasting chord sheets from Ultimate Guitar and WorshipTogether
                  </FeatureItem>
                </ul>
              </FeatureItem>
              <FeatureItem>
                Scripture template adjustments on presenter view and set editor
              </FeatureItem>
              <FeatureItem>Scripture import flow</FeatureItem>
              <FeatureItem>Song lyric import flow</FeatureItem>
              <FeatureItem>Refined song lyric import API</FeatureItem>
              <FeatureItem>Sign in and sign out</FeatureItem>
              <FeatureItem>
                Home screen UI adjustments
                <ul className="mt-1 space-y-1 pl-2">
                  <FeatureItem>
                    Set dragging on home screen (reordering sets within a gathering)
                  </FeatureItem>
                  <FeatureItem>Fixed catalogue box size</FeatureItem>
                  <FeatureItem>Search via song lyric</FeatureItem>
                </ul>
              </FeatureItem>
              <FeatureItem>
                Presenter view adjustments
                <ul className="mt-1 space-y-1 pl-2">
                  <FeatureItem>Search via song lyric</FeatureItem>
                  <FeatureItem>Universal cross-fading</FeatureItem>
                  <FeatureItem>Simplified blackout function</FeatureItem>
                  <FeatureItem>Adjust preview slide size</FeatureItem>
                </ul>
              </FeatureItem>
              <FeatureItem>Cross-device sync</FeatureItem>
              <FeatureItem>
                Gatherings going live
                <ul className="mt-1 space-y-1 pl-2">
                  <FeatureItem>QR code generation</FeatureItem>
                  <FeatureItem>Viewing gatherings on mobile</FeatureItem>
                </ul>
              </FeatureItem>
              <FeatureItem>Importing and exporting catalogues as .phyto</FeatureItem>
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
