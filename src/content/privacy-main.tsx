import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PrivacyMain({ defaultSection }: { defaultSection: "offline" | "online" }) {
  return (
    <div>
      <Tabs defaultValue={defaultSection} className="mt-3">
        <TabsList className="h-auto gap-2 rounded-none bg-transparent p-0">
          <TabsTrigger
            value="offline"
            className="mono pill rounded-full border-2 border-white bg-transparent px-4 py-1.5 text-xs uppercase tracking-wider text-white transition hover:bg-white hover:text-[var(--brand-blue)] data-[state=active]:bg-white data-[state=active]:text-[var(--brand-blue)] data-[state=active]:shadow-none"
          >
            Offline
          </TabsTrigger>
          <TabsTrigger
            value="online"
            className="mono pill rounded-full border-2 border-white bg-transparent px-4 py-1.5 text-xs uppercase tracking-wider text-white transition hover:bg-white hover:text-[var(--brand-blue)] data-[state=active]:bg-white data-[state=active]:text-[var(--brand-blue)] data-[state=active]:shadow-none"
          >
            Online
          </TabsTrigger>
        </TabsList>

        <p className="mono mt-6 text-xs uppercase tracking-wider opacity-70">
          Effective Date: July 21, 2026
        </p>

        {/* OFFLINE TAB */}
        <TabsContent value="offline">
          <div className="mt-6 space-y-6 text-base leading-relaxed opacity-90">
            <p>
              This policy applies when you use phyto locally on your device without creating an
              account. It is intentionally short because we collect almost nothing.
            </p>

            <section>
              <h2 className="text-2xl">1. No Account Required</h2>
              <p className="mt-2">
                phyto is fully usable without creating an account or providing any personal
                information. You can create songs, scripture references, gatherings, and sets
                entirely offline with no interaction with any server.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">2. Local Storage Only</h2>
              <p className="mt-2">
                All content you create in phyto is stored exclusively on your own device using your
                browser's local storage and IndexedDB. This data:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>Never leaves your device</li>
                <li>Is never sent to any server</li>
                <li>Is not accessible to the developer or any third party</li>
                <li>May be lost if you clear your browser data or uninstall the app</li>
              </ul>
              <p className="mt-2">
                You can export your catalogue at any time using the built-in export feature. The
                exported <code>.phyto</code> file is created and saved entirely on your device. It
                is never transmitted to any server. We strongly recommend exporting periodically to
                avoid data loss.
              </p>
              <p className="mt-2">
                The one exception is video media you upload. Uploading video to your account is a
                signed-in feature that stores the file on our servers; it is described in the Online
                policy below. Images, PDFs, and all other content you add stay on your device as
                described above.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">3. Feedback Form</h2>
              <p className="mt-2">
                phyto includes an optional feedback form at{" "}
                <a href="https://phyto.live/feedback" className="underline hover:opacity-60">
                  phyto.live/feedback
                </a>
                . If you choose to submit feedback, the content of your message and any contact
                information you voluntarily provide (such as your email address) will be transmitted
                to and stored in our Supabase database (hosted in the US East region), and a copy is
                emailed to the developer via Resend (our email provider) so it can be reviewed. This
                information is used solely to review feedback and improve the app. We do not sell
                your information or share it with unrelated third parties. Submitting feedback is
                entirely optional and is not required to use any feature of the app.
              </p>
              <p className="mt-2">
                Positive feedback such as testimonials may be shared publicly on phyto's social
                media channels. We will not share personally sensitive information without your
                consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">4. Contribute Form</h2>
              <p className="mt-2">
                phyto includes an optional contribute form at{" "}
                <a href="https://phyto.live/contribute" className="underline hover:opacity-60">
                  phyto.live/contribute
                </a>{" "}
                for people who want to help build phyto (app development, backend, design, social
                media, and more). If you choose to submit it, the information you provide, which
                may include your name, email, a link to your portfolio or Instagram, your
                experience, how you use AI, and a short testimony of your faith, is transmitted to
                and stored in our Supabase database (hosted in the US East region) and a copy is
                emailed to the developer via Resend so it can be reviewed. This information is used
                solely to evaluate and follow up on contributor submissions. We do not sell your
                information or share it with unrelated third parties. Submitting the contribute
                form is entirely optional and is not required to use any feature of the app.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">5. Analytics & Tracking</h2>
              <p className="mt-2">
                phyto does not use tracking pixels, analytics services, or any monitoring
                technology. We do not track your usage, behaviour, or session data in any form. No
                advertising, analytics, or third-party tracking cookies are used.
              </p>
              <p className="mt-2">phyto uses one strictly functional cookie:</p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>
                  <strong>sidebar_state:</strong> remembers whether the sidebar is open or
                  collapsed. Retained for 7 days.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl">6. Hosting</h2>
              <p className="mt-2">
                The web-hosted version of phyto is served via Cloudflare Workers. Cloudflare may
                collect standard server-side logs such as IP addresses as part of normal hosting
                operations. Please review{" "}
                <a
                  href="https://cloudflare.com/privacypolicy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-60"
                >
                  Cloudflare's privacy policy
                </a>{" "}
                for details. The downloadable offline version of phyto operates entirely on your
                device with no network dependency.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">7. Third-Party APIs</h2>
              <p className="mt-2">phyto relies on the following external services:</p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>
                  <strong>bolls.life:</strong> fetches Bible verse text when you look up scripture
                  passages. The request includes the translation name, book, and chapter you
                  selected. No personal information is sent.{" "}
                  <a
                    href="https://bolls.life"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    bolls.life
                  </a>
                </li>
                <li>
                  <strong>lrclib.net:</strong> fetches song lyrics when you search for a song in the
                  song editor. The request includes the search query you typed. No personal
                  information is sent.{" "}
                  <a
                    href="https://lrclib.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    lrclib.net
                  </a>
                </li>
                <li>
                  <strong>Supabase:</strong> feedback and contribute form submissions are stored in
                  a Supabase database hosted in the US East region (AWS us-east-1). No account is
                  required to submit either form.{" "}
                  <a
                    href="https://supabase.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    Supabase Privacy Policy
                  </a>
                </li>
                <li>
                  <strong>Resend:</strong> delivers email on our behalf. Feedback and contribute
                  form submissions are forwarded to the developer by email through Resend.{" "}
                  <a
                    href="https://resend.com/legal/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    Resend Privacy Policy
                  </a>
                </li>
              </ul>
              <p className="mt-2">
                If you prefer not to use these services, you can enter scripture text or song lyrics
                manually instead.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">8. Stripe</h2>
              <p className="mt-2">
                The app links to a voluntary donation page hosted by Stripe at{" "}
                <a
                  href="/donate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-60"
                >
                  phyto.live/donate
                </a>
                . Any payment information you provide is handled entirely by Stripe and subject to
                Stripe's own privacy policy. phyto does not receive or store your payment details.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">9. Instagram</h2>
              <p className="mt-2">
                The app links to phyto's Instagram profile at{" "}
                <a
                  href="https://www.instagram.com/phyto.live"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-60"
                >
                  instagram.com/phyto.live
                </a>
                . Visiting that page is subject to Instagram's privacy policy. phyto has no control
                over Instagram's data practices.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">10. Children's Privacy</h2>
              <p className="mt-2">
                We do not knowingly collect personal information from anyone. The feedback form
                should not be submitted by children without parental guidance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">11. Changes to This Policy</h2>
              <p className="mt-2">
                We may update this Privacy Policy from time to time. Updates will be reflected on
                this page with a revised effective date. Continued use of the app after any change
                constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">12. Contact</h2>
              <p className="mt-2">
                Questions about this Privacy Policy can be submitted via the feedback form at{" "}
                <Link to="/feedback" className="underline hover:opacity-60">
                  phyto.live/feedback
                </Link>
                .
              </p>
            </section>
          </div>
        </TabsContent>

        {/* ONLINE TAB */}
        <TabsContent value="online">
          <div className="mt-6 space-y-6 text-base leading-relaxed opacity-90">
            <p>
              This policy applies when you create an account and use phyto's online features,
              including cross-device sync and live gathering sharing. By signing in, you agree to
              this policy in addition to the offline policy above.
            </p>

            <section>
              <h2 className="text-2xl">1. Information We Collect</h2>
              <p className="mt-2">When you create an account, we collect:</p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>
                  <strong>Email address:</strong> used to authenticate you via one-time code or
                  Google OAuth, to send you a one-time welcome email, and — only if you opt in at
                  sign-in — to send occasional product updates. See section 6 below.
                </li>
                <li>
                  <strong>Catalogue content:</strong> your sets and gatherings, synced to our
                  database so you can access them across devices
                </li>
                <li>
                  <strong>Uploaded media:</strong> any video files you upload for use in your slides
                  are stored on our servers. See section 5 below.
                </li>
                <li>
                  <strong>Device identifier:</strong> an anonymous ID generated locally on each
                  device, used only to resolve sync conflicts between devices. It is never linked to
                  your identity.
                </li>
              </ul>
              <p className="mt-2">
                We do not collect your name, payment information, location, or any other personal
                data beyond what is listed above.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">2. How Your Data Is Stored</h2>
              <p className="mt-2">Your data is stored in two places:</p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>
                  <strong>Locally:</strong> on your device using IndexedDB, so the app works offline
                </li>
                <li>
                  <strong>In the cloud:</strong> in a Supabase database hosted in the US East region
                  (AWS us-east-1), so your catalogue stays in sync across devices
                </li>
                <li>
                  <strong>Object storage:</strong> any video files you upload are stored in
                  Cloudflare R2, separate from your catalogue database. See section 5.
                </li>
              </ul>
              <p className="mt-2">
                Your catalogue data is isolated by account. No other user can access your catalogue.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">3. Cross-Device Sync</h2>
              <p className="mt-2">
                When you are signed in and online, changes to your catalogue are automatically
                pushed to Supabase. When you sign in on a new device, you will be prompted to choose
                how to handle any differences between your local data and what is stored in
                Supabase. We use a last-write-wins approach for automatic conflict resolution.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">4. Live Sharing</h2>
              <p className="mt-2">
                When you start a live session, your gathering content becomes publicly accessible to
                anyone with the share link or QR code. You are solely responsible for what content
                you share publicly. phyto does not moderate, review, or take responsibility for
                publicly shared gathering content. The live session ends when you choose to end it,
                at which point the link stops working.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">5. Uploaded Media</h2>
              <p className="mt-2">
                Signed-in users can upload short video clips to use as slide media. Uploaded videos
                are stored in Cloudflare R2 (object storage) rather than on your device, subject to
                a limit of 100 MB per file and 300 MB total per account.
              </p>
              <p className="mt-2">
                Each uploaded file is served from its own public URL containing a random,
                unguessable identifier. The URL is not listed or searchable anywhere, but it is not
                access-controlled: anyone you share the link with, or who otherwise obtains it, can
                view the file. Please do not upload anything you would not want to be publicly
                accessible.
              </p>
              <p className="mt-2">
                You can delete an uploaded video at any time by removing the slide that uses it,
                which also frees up your storage quota. Deleting your account removes your uploaded
                media as described in section 8.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">6. Email Communications</h2>
              <p className="mt-2">
                When you first sign in, we send a one-time welcome email to your address through
                Resend, our email delivery provider. If you check the optional "keep me in the loop"
                box at sign-in, your email address is also added to our mailing list (managed in
                Resend) so we can send occasional updates and news about phyto.
              </p>
              <p className="mt-2">
                Marketing emails are strictly opt-in. Every such email includes an unsubscribe link,
                and you can opt out at any time. We do not sell your email address or share it with
                unrelated third parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">7. Third-Party Services</h2>
              <p className="mt-2">
                phyto uses the following third-party services for online features:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>
                  <strong>Supabase:</strong> database and authentication, hosted in US East.{" "}
                  <a
                    href="https://supabase.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    Supabase Privacy Policy
                  </a>
                </li>
                <li>
                  <strong>Google:</strong> optional OAuth sign-in only.{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    Google Privacy Policy
                  </a>
                </li>
                <li>
                  <strong>Cloudflare Workers & R2:</strong> web hosting and object storage for
                  uploaded video media.{" "}
                  <a
                    href="https://cloudflare.com/privacypolicy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    Cloudflare Privacy Policy
                  </a>
                </li>
                <li>
                  <strong>Resend:</strong> sends the welcome email and, if you opt in, mailing-list
                  updates.{" "}
                  <a
                    href="https://resend.com/legal/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    Resend Privacy Policy
                  </a>
                </li>
                <li>
                  <strong>bolls.life:</strong> Bible text API for scripture lookups.{" "}
                  <a
                    href="https://bolls.life"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    bolls.life
                  </a>
                </li>
                <li>
                  <strong>lrclib.net:</strong> song lyric search API.{" "}
                  <a
                    href="https://lrclib.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    lrclib.net
                  </a>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl">8. Data Retention & Deletion</h2>
              <p className="mt-2">
                Your data is retained for as long as your account exists. To request deletion of
                your account and all associated data from Supabase, contact us via the feedback form
                at{" "}
                <Link to="/feedback" className="underline hover:opacity-60">
                  phyto.live/feedback
                </Link>
                . We will process deletion requests within 30 days. Account deletion also removes
                any video media you uploaded to Cloudflare R2. If you opted in to the mailing list,
                you can unsubscribe at any time using the link in any email. Local data on your
                device must be cleared separately by clearing your browser's IndexedDB storage.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">9. Analytics & Tracking</h2>
              <p className="mt-2">
                phyto does not use analytics, advertising trackers, or any behavioural monitoring.
                The only cookies used are strictly functional: a session cookie set by Supabase to
                maintain your signed-in state, and the sidebar_state preference cookie described in
                the offline policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">10. Children's Privacy</h2>
              <p className="mt-2">
                phyto's online features are not directed at children under 13. We do not knowingly
                collect personal information from children. If you believe a child has created an
                account, please contact us via the feedback form and we will delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">11. Changes to This Policy</h2>
              <p className="mt-2">
                We may update this Privacy Policy from time to time. Updates will be reflected on
                this page with a revised effective date. Continued use of online features after any
                change constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">12. Contact</h2>
              <p className="mt-2">
                Questions about this Privacy Policy can be submitted via the feedback form at{" "}
                <Link to="/feedback" className="underline hover:opacity-60">
                  phyto.live/feedback
                </Link>
                .
              </p>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
