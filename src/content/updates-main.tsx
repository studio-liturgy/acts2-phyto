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

// TODO(merge): the date this release reaches phyto.live, e.g. "September 29, 2026".
const RELEASE_DATE = "Merge date, 2026";

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
        <ul className="mt-8 space-y-12">
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">{RELEASE_DATE}</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Sharing</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Share a set with anyone by email. It&rsquo;s linked and two-way: you both edit the
                same set, and you can revoke access any time. Share several at once from the
                catalogue&rsquo;s edit mode
              </FeatureItem>
              <FeatureItem>
                Sets shared with you arrive in a list under your catalogue. Save the ones you want,
                or save them all
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Groups</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Create a group: a shared workspace you invite people into by email. Everyone in the
                group sees and edits the sets shared into it and the group&rsquo;s gatherings
              </FeatureItem>
              <FeatureItem>
                Invitations are accept or decline, and the notification tells you who invited you.
                Manage members, rename, leave, or delete a group from the Manage panel
              </FeatureItem>
              <FeatureItem>
                Leaving a group (or being removed) pulls your sets back out with you, including from
                its gatherings. The group keeps everyone else&rsquo;s. You can belong to up to three
                groups
              </FeatureItem>
              <FeatureItem>
                A group has one live gathering at a time, and any member can run it
              </FeatureItem>
              <FeatureItem>
                In a group, a Personal filter shows just the sets you contributed
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Your gathering&rsquo;s address
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Every account and group now has a permanent link that always points at whatever is
                live
              </FeatureItem>
              <FeatureItem>
                Customize it from the go-live dialog, then print the QR code once and reuse it week
                after week
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Multi-language
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Turn on multi-language in Settings (or under Manage for a group) and pick two
                languages
              </FeatureItem>
              <FeatureItem>
                Scripture imports fetch both versions, verse by verse, and stack them on the
                projector and on phones
              </FeatureItem>
              <FeatureItem>
                A set can carry both versions and each workspace shows what it needs
              </FeatureItem>
              <FeatureItem>
                A set whose versions don&rsquo;t fit the workspace&rsquo;s languages shows a warning
                triangle in the catalogue, the editor and the presenter. The set stays frozen until
                it&rsquo;s re-imported in the workspace&rsquo;s languages, or duplicated
              </FeatureItem>
              <FeatureItem>
                Available languages and bible versions
                <ul className="mt-1 space-y-1 pl-2">
                  <FeatureItem>English: NIV, NLT, ESV, NRSV, NASB, NKJV, KJV, AMP, MSG</FeatureItem>
                  <FeatureItem>Japanese: JPNICT, NJB, JPKJV</FeatureItem>
                  <FeatureItem>Chinese: CUNPS, CUV, CUNP, PCBS, PCB, ChiSB</FeatureItem>
                  <FeatureItem>Korean: KRV, RNKSV</FeatureItem>
                  <FeatureItem>Indonesian: TB</FeatureItem>
                  <FeatureItem>Arabic: NAV, SVD</FeatureItem>
                  <FeatureItem>Spanish: RV1960, NVI, NTV, LBLA, PDT</FeatureItem>
                  <FeatureItem>Portuguese: NVI-PT, ARA, NAA, NTLH, NVT</FeatureItem>
                  <FeatureItem>French: LSG, BDS, NBS, PDV</FeatureItem>
                </ul>
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Messages</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                A scripture set can grow images and points (a quote, a bulleted list, or a
                statement) and become a message
              </FeatureItem>
              <FeatureItem>
                Build the order by dragging passages, points and images as blocks
              </FeatureItem>
              <FeatureItem>Bullet points can be dots or numbers</FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Scripture and message editors
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Backspace at the start of a verse merges it into the one above, and cmd or ctrl and
                Enter splits one at the cursor
              </FeatureItem>
              <FeatureItem>Bold, italic and underline with cmd or ctrl and B, I or U</FeatureItem>
              <FeatureItem>Undo works, and the arrow keys move between verses</FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Media sets</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Divide a media set into named, coloured sections. The names show on phones, and Loop
                can now loop within a section
              </FeatureItem>
              <FeatureItem>
                Fill frame or Fit image, for one image or every image at once
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Presenter</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Fast Edit a song line or a message point right from the slide preview
              </FeatureItem>
              <FeatureItem>
                Text now shrinks to fit the slide, so a larger font or a long verse can&rsquo;t run
                off the top and bottom
              </FeatureItem>
              <FeatureItem>
                A standalone set&rsquo;s name, category and edit button sit in the top bar. The
                category shows as a coloured dot
              </FeatureItem>
              <FeatureItem>
                Hide sections of a scripture or message the way you can for a song
              </FeatureItem>
              <FeatureItem>Kind filter chips carry coloured dots instead of codes</FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Home</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                The catalogue chips toggle on and off. There is no All chip any more
              </FeatureItem>
              <FeatureItem>
                Edit mode: Select all, and Export only exports what you selected
              </FeatureItem>
              <FeatureItem>
                Fixed a set dropped onto a gathering&rsquo;s existing row not being added
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Settings</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                A Settings pill by Sign out: theme, workspace language, a storage bar, and Delete
                account, which removes everything you own at once
              </FeatureItem>
              <FeatureItem>
                Settings work signed out too, and carry over to your account the first time you sign
                in
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Media limits
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Images and PDFs up to 5 MB, videos up to 100 MB, 50 MB per account. Accounts from
                before this release keep their 300 MB
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Intro</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                The intro page has clips of the new features and copy to match
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Transparency
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                <Link to="/transparency" className="underline hover:opacity-60">
                  phyto.live/transparency
                </Link>{" "}
                shows live usage numbers and a ledger of every donation and expense
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Fixes</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                The sync Merge button only ever adds. It no longer brings back sets you deleted
                elsewhere
              </FeatureItem>
              <FeatureItem>
                A set that appears twice in a gathering reorders and removes the right copy
              </FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">September 9, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
              Mobile preview in presenter
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                A new Mobile preview in the presenter. Flip between Slides and Mobile at the top to
                see exactly what is seen on phones, without leaving the presenter
              </FeatureItem>
              <FeatureItem>
                Hide a song&rsquo;s sections using the eye controls beside the phone preview. Hidden
                sections drop out of your view and disappear for everyone following on their phones,
                and from the presenter&rsquo;s slides too. Hidden sections are set per gathering
              </FeatureItem>
              <FeatureItem>
                Preview how the phone looks from the presenter (font size, font type, light or dark
                theme, and chords). The settings are still viewer customizable
              </FeatureItem>
              <FeatureItem>
                Edit a set straight from the mobile preview: hover it and click the pencil, and you
                land back on that same set when you&rsquo;re done
              </FeatureItem>
            </ul>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Gatherings</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Rename or delete a gathering from the presenter. Click the pencil by its name to
                rename, and a delete button appears next to Done
              </FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">September 7, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Song editor</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Edit Song Template now has an All Caps or Mixed Case choice under Font type, in both
                the song editor and the presenter. It only changes how the lyrics look on the slide:
                the words you typed stay exactly as you wrote them
              </FeatureItem>
            </ul>
          </li>
          <li className="border-t border-[var(--brand-white)]/20 pt-8">
            <div className="text-2xl">August 19, 2026</div>

            <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Chords</div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Anyone following a gathering on their phone can switch between chord letters and
                Nashville numbers, and transpose a song to any key, right from their own screen (it
                only changes what they see, never what the leader or anyone else is looking at)
              </FeatureItem>
              <FeatureItem>
                Fixed an extra blank line showing up on the phone view wherever a song&rsquo;s
                lyrics split onto a new slide
              </FeatureItem>
            </ul>
          </li>
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
              Song catalogue
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Fixed the songs in the built-in catalogue that wrote the word I in lowercase
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
              Song catalogue
            </div>
            <ul className="mt-2 space-y-1">
              <FeatureItem>
                Around 1,500 songs in the built-in catalogue now come with their chords, and 1,850
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
                Built-in worship song catalogue: search over 3,000 songs fully offline, with results
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
