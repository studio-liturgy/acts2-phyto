import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
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

export default function UpdatesMain() {
  usePageBackgroundColor("var(--brand-blue)");
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link
          to="/"
          className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-3 w-3" /> BACK
        </Link>
        <h1 className="mt-6 text-5xl">Updates</h1>
        <ul className="mt-8 space-y-12">
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">August 11, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Chords</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Breaking a line in the middle now takes the chords with it. Everything after your
                cursor moves down to the new line and stays on the words it belonged to, whether
                chords are showing or hidden
              </FeatureItem>
              <FeatureItem>
                Fixed a chord disappearing when a --- divider was typed right up against the next
                word with no space
              </FeatureItem>
              <FeatureItem>
                Paste a song written in ChordPro and it converts on the way in, chords and section
                headings included
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Song library
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Fixed the songs in the built-in library that wrote the word I in lowercase
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Presenting</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Fixed the output screen going stale. Casting to a Chromecast or an Apple TV could
                leave it holding the previous slide after sitting on one for a while, and take a
                long time to catch up
              </FeatureItem>
              <FeatureItem>
                Cross dissolve and auto advance now use the same plus and minus buttons as lines per
                slide
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Home</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>New gatherings are named for the day without the year</FeatureItem>
              <FeatureItem>
                Importing and exporting your catalogue has moved into the catalogue&rsquo;s edit
                mode, out of the way of everyday use
              </FeatureItem>
              <FeatureItem>
                Tidied the highlight on a gathering while you drag a set onto it, which could clip
                against the row above
              </FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">August 6, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Chords</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Songs can now carry chords. They sit on their own row above the words they belong
                to, the way a chord sheet is normally written
              </FeatureItem>
              <FeatureItem>
                Chords never appear on the projector. They are only ever for you and your musicians
              </FeatureItem>
              <FeatureItem>
                Anyone following a gathering on their phone can turn chords on from the menu. They
                stay hidden unless someone asks for them
              </FeatureItem>
              <FeatureItem>
                Switch between chord letters and Nashville numbers, and change the key to transpose
                a whole song at once
              </FeatureItem>
              <FeatureItem>
                A row of buttons for the seven chords in your key, ready to drop in wherever your
                cursor is, plus a button to clear the chords off a line
              </FeatureItem>
              <FeatureItem>
                Paste a chord sheet straight from Ultimate Guitar or WorshipTogether. The chords
                land on the right words on their own
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Song library
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Around 1,500 songs in the built-in library now come with their chords, and 1,850
                come with a key already set
              </FeatureItem>
              <FeatureItem>
                Merged hundreds of songs that were listed twice under different titles
              </FeatureItem>
              <FeatureItem>
                Cleared out stray underscores, dashes, and punctuation that showed up in some
                imported lyrics. A word broken across a chord change now reads as one word again
              </FeatureItem>
              <FeatureItem>
                Chord charts and bar lines that were sitting in a few songs as if they were lyrics
                no longer show up on the projector
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Song editor</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Search for another song from inside the editor and go straight to it, without
                heading back to the catalogue first
              </FeatureItem>
              <FeatureItem>Undo and redo in the lyrics box with cmd or ctrl and Z</FeatureItem>
              <FeatureItem>
                Fixed the lines per slide arrows. Changing them after importing a song now actually
                moves the slide dividers
              </FeatureItem>
              <FeatureItem>Fixed scrollbars showing up dark against a dark background</FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">July 29, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Gatherings</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Live gatherings now end automatically 24 hours after they start. You can still end a
                session yourself at any time, or go live on another gathering
              </FeatureItem>
              <FeatureItem>
                Share links for gatherings that have finished now show the ended screen instead of
                staying open indefinitely
              </FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">July 21, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Contribute</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                New page at{" "}
                <Link to="/contribute" className="underline hover:opacity-60">
                  phyto.live/contribute
                </Link>{" "}
                for anyone who wants to help build phyto: app development, backend, UI/UX design,
                graphic design, social media, and more
              </FeatureItem>
              <FeatureItem>Linked from the footer and homepage</FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">July 16, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Sync</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Fixed a bug where deleting a song, set, or gathering on one device could bring it
                back on another. Deletions now sync reliably across all your devices
              </FeatureItem>
              <FeatureItem>
                First sign-in is noticeably faster, with a loading screen while your account syncs
                in
              </FeatureItem>
              <FeatureItem>
                Fixed phantom sync conflicts that could appear just from opening a song or scripture
                editor
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Home and catalogue
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Set names can no longer be left blank: clearing the name field and clicking away or
                pressing Enter now reverts to the previous name
              </FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">July 1, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Mobile</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Visiting on mobile no longer hits a hard block: you'll land on a mobile-friendly
                intro with a short guided walkthrough
              </FeatureItem>
              <FeatureItem>
                Leave your email in the new popup to hear when full mobile support lands
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Home and catalogue
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                New guided intro when your catalogue is empty: three scrolling steps with short
                videos covering creating sets, going online, and presenting. Revisit anytime from
                the new Intro link
              </FeatureItem>
              <FeatureItem>
                Gatherings scroll horizontally once you have more than two, with the live gathering
                always shown first
              </FeatureItem>
              <FeatureItem>Only one gathering can be edited at a time</FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">June 25, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-60">Presenter</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Catalogue edit mode on the home page, plus a range of smaller presenter UX
                refinements
              </FeatureItem>
              <FeatureItem>
                Smoother media auto-advance, with cleaner fade-to-black handling for videos
              </FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">
              Gathering viewer (mobile)
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Video and YouTube media now play in the public mobile viewer, not just on the
                presenter screen
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Online</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Your signed-in email now shows next to the sync indicator on the home page, so you
                can see which account you are using
              </FeatureItem>
              <FeatureItem>
                Signing in on a device with existing content now offers a Replace option, with a
                confirmation before any effects are applied
              </FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">June 23, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Offline</div>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Media</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Added video to media: upload a clip, paste a YouTube link, or paste a direct video
                URL, then play on click or autoplay live
              </FeatureItem>
              <FeatureItem>
                Added the ability to upload PDF files to media: upload limit of 5MB with a clear
                message
              </FeatureItem>
              <FeatureItem>Smoother drag-and-drop when adding more than one file</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">
              Songs and search
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Built-in worship song library: search over 3,000 songs fully offline, with results
                that appear instantly
              </FeatureItem>
              <FeatureItem>
                Smarter search: type &ldquo;Title by Artist&rdquo; to find the right song, or search
                by a line of lyrics
              </FeatureItem>
              <FeatureItem>
                Cleaner imported lyrics: chords are stripped, parenthetical notes like (Intro) or
                (x2) are removed, and duplicate songs are merged
              </FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Scripture</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Added the ability to edit the Scripture template</FeatureItem>
              <FeatureItem>
                Improved the flow of importing scripture verses, song lyrics, and media by reducing
                steps
              </FeatureItem>
              <FeatureItem>
                Importing a second passage now appends it below the first instead of replacing it
              </FeatureItem>
              <FeatureItem>Added Amplified and The Message to the available versions</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">Presenter</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Hide individual song sections for a gathering session: a new eye toggle enters a
                manage mode, and hidden sections drop out of the grid and are skipped when
                navigating
              </FeatureItem>
              <FeatureItem>
                Search your whole catalogue from inside a gathering and insert any set inline
              </FeatureItem>
              <FeatureItem>Sets list sorts alphabetically, with a sort toggle</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">
              Home and catalogue
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Sort toggle on the catalogue: A to Z, or newest first</FeatureItem>
              <FeatureItem>Renamed Playlists to Gatherings throughout</FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">
              Import and export
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Export your full catalogue as a .phyto file anytime, then import it on any device to
                restore or share your content. It now carries your gatherings, not just songs
              </FeatureItem>
              <FeatureItem>
                Content from the earlier version migrates automatically on first load
              </FeatureItem>
            </ul>

            <div className="mono mt-3 text-xs uppercase tracking-wider opacity-60">
              Gathering viewer (mobile)
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Go live to view on mobile: take a gathering live with a unique share link and QR
                code, viewable on a phone through a public viewer page
              </FeatureItem>
              <FeatureItem>Simple QR background picker: black, white, or transparent</FeatureItem>
              <FeatureItem>Pinch-to-zoom and swipe between sets</FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Online</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Sign in: create an account using a 6-digit email sign-in code or Google to access
                online features
              </FeatureItem>
              <FeatureItem>Optional mailing-list opt-in when you sign in</FeatureItem>
              <FeatureItem>A welcome email on your first sign-in</FeatureItem>
              <FeatureItem>
                Cross-device sync: when signed in, your catalogue and gatherings sync across
                devices. Now more reliable across multiple tabs and faster at syncing individual
                edits
              </FeatureItem>
              <FeatureItem>Feedback you submit now reaches us by email</FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Donations and site
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>Donations now go through Stripe</FeatureItem>
              <FeatureItem>
                Combined Terms of Use and Privacy Policy into a single Legal page
              </FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">May 28, 2026</div>
            <ul className="mt-3 space-y-1">
              <FeatureItem>Reviewed and adjusted all copy for coherence</FeatureItem>
              <FeatureItem>
                Removed password and publicized GitHub repo. The app is now completely free and open
                source!
              </FeatureItem>
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
