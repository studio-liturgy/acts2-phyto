import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

// The next release's Updates entry. Shown on phyto.live/updates (updates-main)
// and, until it ships, at the top of phytoexp.live/updates (updates-test) so
// the copy can be checked in place.
export const RELEASE_DATE = "September 26, 2026";

export function FeatureItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Plus className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.5} />
      <div className="flex-1">{children}</div>
    </li>
  );
}

/** One `<li>` for the page's entry list. */
export function ReleaseEntry() {
  return (
    <li className="border-t border-[var(--brand-white)]/20 pt-8">
      <div className="text-2xl">{RELEASE_DATE}</div>

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
