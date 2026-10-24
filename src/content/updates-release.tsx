import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

// The latest release's date: the newest Updates entry (shown on
// phyto.live/updates via updates-main and, until it ships, at the top of
// phytoexp.live/updates via updates-test) and the Terms Effective Date. Older
// entries write their own date.
export const RELEASE_DATE = "October 24, 2026";

export function FeatureItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Plus className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
      <div className="flex-1">{children}</div>
    </li>
  );
}

const sectionCls = "mt-8 text-xl";
const subCls = "mono mt-5 text-xs uppercase tracking-wider opacity-80";

/** October 24, 2026: song modes, export, background, go live. One `<li>`, above ArrangementsEntry. */
export function SongModesEntry() {
  return (
    <li className="border-t border-[var(--brand-white)]/20 pt-8">
      <div className="text-2xl">{RELEASE_DATE}</div>

      <div className={sectionCls}>Songs</div>

      <div className={subCls}>Song Modes</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Every song now has a Mode, picked beside the SONG pill: Standard, Multi-Language or Call
          and Response. Chords can be on or off in any mode
        </FeatureItem>
        <FeatureItem>
          Switching modes never loses anything. Languages and roles you set aside come back when you
          switch back
        </FeatureItem>
        <FeatureItem>The presenter shows each song&rsquo;s mode on its pill</FeatureItem>
        <FeatureItem>
          In the Multi-Language and Call and Response grids, cmd or ctrl and Enter starts a new
          slide at the cursor, and shift and Enter adds a new line. Drag sections and slide breaks
          around, and copy, cut and paste lines
        </FeatureItem>
      </ul>

      <div className={subCls}>Multi-Language</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Write a song in several languages side by side, one column per language, and the slides
          show them together
        </FeatureItem>
        <FeatureItem>
          A language bar in the editor and the presenter picks which languages show and the order
          they appear in
        </FeatureItem>
        <FeatureItem>
          Enter splits a line at the cursor in just that language, and Backspace at the start of a
          line joins it back
        </FeatureItem>
        <FeatureItem>Language lists are searchable</FeatureItem>
        <FeatureItem>
          Every script shows in fonts already on your computer, and Hebrew and Farsi read right to
          left
        </FeatureItem>
        <FeatureItem>
          Available languages
          <ul className="mt-1 space-y-1 pl-2">
            <FeatureItem>
              English, Japanese, Chinese (simplified), Chinese (traditional), Korean, Arabic,
              Indonesian, Spanish, Portuguese, French, German, Hindi, Vietnamese, Tagalog, Thai,
              Tamil, Malayalam, Russian, Ukrainian, Polish, Dutch, Italian, Farsi, Hebrew, Swahili
              and Amharic
            </FeatureItem>
            <FeatureItem>
              Reading aids: Japanese hiragana and romaji, Chinese pinyin and zhuyin, Cantonese
              jyutping, romanized Korean and romanized Hindi
            </FeatureItem>
          </ul>
        </FeatureItem>
      </ul>

      <div className={subCls}>Call and Response</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Designate each line for the Leader or the People. A gap appears wherever the reader
          changes, on the slides and on phones
        </FeatureItem>
        <FeatureItem>
          Turn on role marks (off by default) and align lines Left, Middle or Right
        </FeatureItem>
      </ul>

      <div className={subCls}>Song Search</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Metrical psalms from the Seedbed Psalter now appear in song search, set to familiar tunes
          and ready to sing
        </FeatureItem>
      </ul>

      <div className={subCls}>Song Arrangements</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Sections added to a song later now show up in saved arrangements, right after the section
          written before them
        </FeatureItem>
      </ul>

      <div className={subCls}>Fixes</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          A slide&rsquo;s thumbnail no longer flashes full size while you type in it
        </FeatureItem>
      </ul>

      <div className={sectionCls}>Export</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Export a gathering as a PDF or PowerPoint: every set in running order, with arrangements
          and hidden sections respected, each slide exactly as the output shows it
        </FeatureItem>
        <FeatureItem>You can also export an individual set from its editor</FeatureItem>
        <FeatureItem>Slides are drawn at 4K, so text stays sharp on any screen</FeatureItem>
      </ul>

      <div className={sectionCls}>Presenting</div>

      <div className={subCls}>Presenter View</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Click the live slide again to apply template changes to the output. It dissolves over your
          fade time
        </FeatureItem>
        <FeatureItem>
          Song Template, Scripture Template and Media Functions fold open from their title bar, and
          changes apply instantly with no Apply button
        </FeatureItem>
        <FeatureItem>
          Click a catalogue colour again to narrow it down: songs to Chords, Multi-Language or C+R,
          and scriptures to messages. The home chips work the same way
        </FeatureItem>
        <FeatureItem>
          After a reload, the output preview no longer gets stuck on &ldquo;No slide selected&rdquo;
          while a slide is live
        </FeatureItem>
      </ul>

      <div className={subCls}>Background</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          A new Background card in the presenter sets one background for all your slides: a colour,
          or an image with dimming
        </FeatureItem>
        <FeatureItem>Choose the slide shape: 16:9, 16:10, 4:3 or 21:9</FeatureItem>
        <FeatureItem>
          Backgrounds are saved to your account, and slides, the output and exports all follow them
        </FeatureItem>
      </ul>

      <div className={subCls}>Go Live and Share</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          A redesigned Go Live dialog. On the home page it shows a preview of the phone view, a big
          Go Live button, then your QR code and link together
        </FeatureItem>
        <FeatureItem>The QR code downloads at high resolution, sharp enough to print</FeatureItem>
      </ul>

      <div className={subCls}>Phone</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          A QR Code button in the phone menu shows the gathering&rsquo;s QR code full screen, so
          people can pass it to the person next to them
        </FeatureItem>
      </ul>

      <div className={sectionCls}>Sharing</div>

      <div className={subCls}>Groups</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          A group&rsquo;s admin can now remove other members&rsquo; sets right from the set editor
        </FeatureItem>
        <FeatureItem>The Personal filter now cycles through Personal, Others and off</FeatureItem>
      </ul>
    </li>
  );
}

/** October 20, 2026: song arrangements, scripture settings. One `<li>`, above LiveGatheringsEntry. */
export function ArrangementsEntry() {
  return (
    <li className="border-t border-[var(--brand-white)]/20 pt-8">
      <div className="text-2xl">October 20, 2026</div>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Song Arrangements</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Turn on Arrangements in Settings to set a song&rsquo;s section order for each gathering,
          repeats included.
        </FeatureItem>
        <FeatureItem>Arrange it beside the phone preview or the presenter view</FeatureItem>
        <FeatureItem>
          Each gathering keeps its own arrangement and hidden sections, so one service&rsquo;s setup
          never shows up in another
        </FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Scripture</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          A new Scripture Settings dialog holds the import options for a set
        </FeatureItem>
        <FeatureItem>
          New option - reference per slide: each verse slide shows its own verses (John 1:1, John
          1:2)
        </FeatureItem>
        <FeatureItem>
          Hide version reference (off by default) drops the version code from references
        </FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Gatherings</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          In edit mode, a pencil beside each set opens it, and you come back to the gathering still
          in edit mode
        </FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Bug Fixes</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Fixed edits to some sets not saving after switching accounts on the same browser, or after
          importing a set from another account
        </FeatureItem>
        <FeatureItem>
          A passage&rsquo;s first verse no longer joins the end of the passage before it
        </FeatureItem>
      </ul>
    </li>
  );
}

/** October 18, 2026: live gatherings and chord-line typing. One `<li>`, above YouVersionEntry. */
export function LiveGatheringsEntry() {
  return (
    <li className="border-t border-[var(--brand-white)]/20 pt-8">
      <div className="text-2xl">October 18, 2026</div>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Live Gatherings</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          A live gathering now stays live until you end it or go live on another one. If it&rsquo;s
          left running, it ends on its own after 14 days
        </FeatureItem>
        <FeatureItem>
          Phones following a gathering use much less data: they only download what changed, and
          pause while the screen is off
        </FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Bug Fixes</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Typing on a line with chords no longer makes the cursor jump or puts letters in backwards,
          in either the lyrics or the chords
        </FeatureItem>
        <FeatureItem>
          Creating a new set in a group now opens straight into the editor, without briefly showing
          &ldquo;Set not found&rdquo;
        </FeatureItem>
      </ul>
    </li>
  );
}

/** October 9, 2026: YouVersion. One `<li>`, above VersionsEntry. */
export function YouVersionEntry() {
  return (
    <li className="border-t border-[var(--brand-white)]/20 pt-8">
      <div className="text-2xl">October 9, 2026</div>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">YouVersion</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Scripture now comes from YouVersion. NIV works again, along with every version YouVersion
          offers: 1,485 Bibles in 1,262 languages
        </FeatureItem>
        <FeatureItem>
          Versions YouVersion doesn&rsquo;t have, like ESV, KJV, Chinese Union and Korean Revised,
          still work as before
        </FeatureItem>
        <FeatureItem>Schlachter 2000 is now available in German</FeatureItem>
        <FeatureItem>
          The version list shows widely spoken languages A to Z, then every other language
        </FeatureItem>
      </ul>
    </li>
  );
}

/** October 1, 2026: bible versions per set. One `<li>`, above ReleaseEntry. */
export function VersionsEntry() {
  return (
    <li className="border-t border-[var(--brand-white)]/20 pt-8">
      <div className="text-2xl">October 1, 2026</div>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Bible versions</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Every bible version in every language is now available in any scripture or message set
        </FeatureItem>
        <FeatureItem>
          Switch on Two versions in a set&rsquo;s editor to stack a second version under the first.
          Switching it off keeps the first version as it is, edits included
        </FeatureItem>
        <FeatureItem>
          Versions you&rsquo;ve used before sit at the top of the list, and you can type to search
          by name, code or language
        </FeatureItem>
        <FeatureItem>A new set starts in the version you used most recently</FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Settings</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          The multi-language setting is replaced by the per-set switch. The system language is
          English for now; more languages are in the works
        </FeatureItem>
      </ul>
    </li>
  );
}

/** One `<li>` for the page's entry list. */
export function ReleaseEntry() {
  return (
    <li className="border-t border-[var(--brand-white)]/20 pt-8">
      <div className="text-2xl">September 26, 2026</div>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Sharing</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Share a set with anyone by email. It&rsquo;s linked and two-way: you both edit the same
          set, and you can revoke access any time. Share several at once from the catalogue&rsquo;s
          edit mode
        </FeatureItem>
        <FeatureItem>
          Sets shared with you arrive in a list under the top bar. Save the ones you want, or save
          them all
        </FeatureItem>
        <FeatureItem>
          A shared set works like one of your own: edit it, present it, and add it to your
          gatherings
        </FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Groups</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Create a group: a shared workspace you invite people into by email. Everyone in the group
          sees and edits the sets shared into it and the group&rsquo;s gatherings
        </FeatureItem>
        <FeatureItem>
          Invitations are accept or decline, and the notification tells you who invited you. Manage
          members, rename, leave, or delete a group from the Manage panel
        </FeatureItem>
        <FeatureItem>
          Leaving a group (or being removed) pulls your sets back out with you, including from its
          gatherings. The group keeps everyone else&rsquo;s. You can belong to up to three groups
        </FeatureItem>
        <FeatureItem>
          A group has one live gathering at a time, and any member can run it
        </FeatureItem>
        <FeatureItem>In a group, a Personal filter shows just the sets you contributed</FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
        Your gathering&rsquo;s address
      </div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Every account and group now has a permanent link that always points at whatever is live
        </FeatureItem>
        <FeatureItem>
          Customize it from the go-live dialog, then print the QR code once and reuse it week after
          week
        </FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Multi-language</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Turn on multi-language in Settings (or under Manage for a group) and pick two languages
        </FeatureItem>
        <FeatureItem>
          Scripture imports fetch both versions, verse by verse, and stack them on the projector and
          on phones
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
          A scripture set can grow images and points (a quote, a bulleted list, or a statement) and
          become a message
        </FeatureItem>
        <FeatureItem>Build the order by dragging passages, points and images as blocks</FeatureItem>
        <FeatureItem>Bullet points can be dots or numbers</FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">
        Scripture and message editors
      </div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Backspace at the start of a verse merges it into the one above, and cmd or ctrl and Enter
          splits one at the cursor
        </FeatureItem>
        <FeatureItem>Bold, italic and underline with cmd or ctrl and B, I or U</FeatureItem>
        <FeatureItem>Undo works, and the arrow keys move between verses</FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Media sets</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Divide a media set into named, coloured sections. The names show on phones, and Loop can
          now loop within a section
        </FeatureItem>
        <FeatureItem>Fill frame or Fit image, for one image or every image at once</FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Presenter</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Fast Edit a song line or a message point right from the slide preview
        </FeatureItem>
        <FeatureItem>
          Text now shrinks to fit the slide, so a larger font or a long verse can&rsquo;t run off
          the top and bottom
        </FeatureItem>
        <FeatureItem>
          A standalone set&rsquo;s name, category and edit button sit in the top bar. The category
          shows as a coloured dot
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
        <FeatureItem>Edit mode: Select all, and Export only exports what you selected</FeatureItem>
        <FeatureItem>
          Fixed a set dropped onto a gathering&rsquo;s existing row not being added
        </FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Settings</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          A Settings pill by Sign out: theme, workspace language, a storage bar, and Delete account,
          which removes everything you own at once
        </FeatureItem>
        <FeatureItem>
          Settings work signed out too, and carry over to your account the first time you sign in
        </FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Media limits</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>
          Images and PDFs up to 5 MB, videos up to 100 MB, 50 MB per account. Accounts from before
          this release keep their 300 MB
        </FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Intro</div>
      <ul className="mt-2 space-y-1">
        <FeatureItem>The intro page has clips of the new features and copy to match</FeatureItem>
      </ul>

      <div className="mono mt-5 text-xs uppercase tracking-wider opacity-80">Transparency</div>
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
          The sync Merge button only ever adds. It no longer brings back sets you deleted elsewhere
        </FeatureItem>
        <FeatureItem>
          A set that appears twice in a gathering reorders and removes the right copy
        </FeatureItem>
      </ul>
    </li>
  );
}
