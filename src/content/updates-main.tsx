import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

function FeatureItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Plus className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
      <div className="flex-1">{children}</div>
    </li>
  );
}

export default function UpdatesMain() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"><ArrowLeft className="h-3 w-3" /> BACK</Link>
        <h1 className="mt-6 text-5xl">Updates</h1>
        <ul className="mt-8 space-y-12">
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">June 23, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Offline</div>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Media</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Added video to media: upload a clip, paste a YouTube link, or paste a direct video URL, then play on click or autoplay live</FeatureItem>
              <FeatureItem>Added the ability to upload PDF files to media: upload limit of 5MB with a clear message</FeatureItem>
              <FeatureItem>Smoother drag-and-drop when adding more than one file</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Songs and search</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Built-in worship song library: search over 3,000 songs fully offline, with results that appear instantly</FeatureItem>
              <FeatureItem>Smarter search: type &ldquo;Title by Artist&rdquo; to find the right song, or search by a line of lyrics</FeatureItem>
              <FeatureItem>Cleaner imported lyrics: chords are stripped, parenthetical notes like (Intro) or (x2) are removed, and duplicate songs are merged</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Scripture</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Added the ability to edit the Scripture template</FeatureItem>
              <FeatureItem>Improved the flow of importing scripture verses, song lyrics, and media by reducing steps</FeatureItem>
              <FeatureItem>Importing a second passage now appends it below the first instead of replacing it</FeatureItem>
              <FeatureItem>Added Amplified and The Message to the available versions</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Presenter</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Hide individual song sections for a gathering session: a new eye toggle enters a manage mode, and hidden sections drop out of the grid and are skipped when navigating</FeatureItem>
              <FeatureItem>Search your whole catalogue from inside a gathering and insert any set inline</FeatureItem>
              <FeatureItem>Sets list sorts alphabetically, with a sort toggle</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Home and catalogue</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Sort toggle on the catalogue: A to Z, or newest first</FeatureItem>
              <FeatureItem>Renamed Playlists to Gatherings throughout</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Import and export</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Export your full catalogue as a .phyto file anytime, then import it on any device to restore or share your content. It now carries your gatherings, not just songs</FeatureItem>
              <FeatureItem>Content from the earlier version migrates automatically on first load</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Gathering viewer (mobile)</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Go live to view on mobile: take a gathering live with a unique share link and QR code, viewable on a phone through a public viewer page</FeatureItem>
              <FeatureItem>Simple QR background picker: black, white, or transparent</FeatureItem>
              <FeatureItem>Pinch-to-zoom and swipe between sets</FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Online</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Sign in: create an account using a 6-digit email sign-in code or Google to access online features</FeatureItem>
              <FeatureItem>Optional mailing-list opt-in when you sign in</FeatureItem>
              <FeatureItem>A welcome email on your first sign-in</FeatureItem>
              <FeatureItem>Cross-device sync: when signed in, your catalogue and gatherings sync across devices. Now more reliable across multiple tabs and faster at syncing individual edits</FeatureItem>
              <FeatureItem>Feedback you submit now reaches us by email</FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Donations and site</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Donations now go through Stripe</FeatureItem>
              <FeatureItem>Combined Terms of Use and Privacy Policy into a single Legal page</FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">May 28, 2026</div>
            <ul className="mt-3 space-y-1">
              <FeatureItem>Reviewed and adjusted all copy for coherence</FeatureItem>
              <FeatureItem>Removed password and publicized GitHub repo. The app is now completely free and open source!</FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">May 21, 2026</div>
            <p className="mt-3">Released beta for test users.</p>
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
