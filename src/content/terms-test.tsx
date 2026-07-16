import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TermsTest({ defaultSection }: { defaultSection: "offline" | "online" }) {
  return (
    <div>
      <Tabs defaultValue={defaultSection} className="mt-3">
        <TabsList className="h-auto gap-2 rounded-none bg-transparent p-0">
          <TabsTrigger
            value="offline"
            className="mono pill rounded-full border-2 border-white bg-transparent px-4 py-1.5 text-xs uppercase tracking-wider text-white transition hover:bg-white hover:text-[var(--brand-orange)] data-[state=active]:bg-white data-[state=active]:text-[var(--brand-orange)] data-[state=active]:shadow-none"
          >
            Offline
          </TabsTrigger>
          <TabsTrigger
            value="online"
            className="mono pill rounded-full border-2 border-white bg-transparent px-4 py-1.5 text-xs uppercase tracking-wider text-white transition hover:bg-white hover:text-[var(--brand-orange)] data-[state=active]:bg-white data-[state=active]:text-[var(--brand-orange)] data-[state=active]:shadow-none"
          >
            Online
          </TabsTrigger>
        </TabsList>

        <p className="mono mt-6 text-xs uppercase tracking-wider opacity-70">
          Effective Date: June 24, 2026
        </p>

        {/* OFFLINE TAB */}
        <TabsContent value="offline">
          <div className="mt-6 space-y-6 text-base leading-relaxed opacity-90">
            <p>
              These terms apply to all users of phytoexp, whether or not you create an account.
              Please read them before using the app.
            </p>

            <section>
              <h2 className="text-2xl">1. About phytoexp</h2>
              <p className="mt-2">
                phytoexp (
                <a href="https://phytoexp.live" className="underline hover:opacity-60">
                  phytoexp.live
                </a>
                ) is the experimental testing environment for phyto, a free, open-source stage
                presenter application for projecting song lyrics, Bible verses, and custom images
                during live worship gatherings and presentations. Features available here may be
                unstable, incomplete, or subject to change before release on phyto.live.
              </p>
              <p className="mt-2">
                As a pre-release testing environment, features, data, and behaviour may change
                without notice. Do not rely on phytoexp for production use. Data stored here may be
                reset or lost at any time.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">2. Always Free</h2>
              <p className="mt-2">
                phytoexp is, and will always remain, free to use. There is no fee, subscription,
                paywall, or in-app purchase required to access any feature of the app, now or in the
                future.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">3. Donations</h2>
              <p className="mt-2">
                phyto accepts voluntary donations via Stripe at{" "}
                <a
                  href="/donate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-60"
                >
                  phyto.live/donate
                </a>
                . Donations are entirely optional and greatly appreciated. Donating does not grant
                any additional features, rights, or privileges.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">4. Open Source</h2>
              <p className="mt-2">
                phyto is free and open-source software licensed under the GNU General Public License
                v3.0 (GPL-3.0). You are free to use, download, modify, and distribute the software
                in accordance with that license. You may not distribute modified versions under a
                more restrictive license, and you may not sell phyto or charge for access to it. See
                the project repository for the full license text.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">5. Data Portability</h2>
              <p className="mt-2">
                You can export your full catalogue at any time as a <code>.phyto</code> file using
                the built-in export feature. Exports are generated entirely on your device and saved
                locally. No data is sent to any server during export. Exports contain your sets
                only, not gatherings. You can import a <code>.phyto</code> file on any device to
                restore or share your catalogue. phyto is not liable for data loss resulting from
                lost, corrupted, or incompatible export files.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">6. Music Licensing Is Your Responsibility</h2>
              <p className="mt-2">
                phytoexp is a presentation tool only. It does not license, distribute, or authorise
                the public performance, reproduction, or display of copyrighted musical works.
              </p>
              <p className="mt-2">
                If you use phytoexp to display song lyrics or other copyrighted content in a public
                or congregational setting, you are solely responsible for obtaining the appropriate
                licences. We strongly recommend licensing through one or more of the following:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>
                  CCLI (Christian Copyright Licensing International):{" "}
                  <a
                    href="https://ccli.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    ccli.com
                  </a>
                </li>
                <li>
                  OneLicense:{" "}
                  <a
                    href="https://onelicense.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    onelicense.net
                  </a>
                </li>
                <li>
                  LicenSing Online:{" "}
                  <a
                    href="https://licensingonline.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-60"
                  >
                    licensingonline.org
                  </a>
                </li>
                <li>Direct licensing from the copyright holder</li>
              </ul>
              <p className="mt-2">
                The developer of phyto accepts no liability for any copyright infringement arising
                from content you choose to display using the app.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">7. Feedback</h2>
              <p className="mt-2">
                The feedback form at{" "}
                <Link to="/feedback" className="underline hover:opacity-60">
                  phytoexp.live/feedback
                </Link>{" "}
                is provided so users can share bug reports, feature requests, and encouragement.
                Feedback you submit is transmitted to and stored in our Supabase database. It is
                used solely to review and improve the app and is not shared with unrelated third
                parties. By submitting feedback, you grant the developer a non-exclusive,
                royalty-free right to use that feedback to improve the app. The developer may share
                positive feedback such as testimonials on social media. Personally sensitive
                information will not be shared publicly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">8. Disclaimer of Warranties</h2>
              <p className="mt-2 uppercase">
                The app is provided "as is" and "as available", without warranty of any kind,
                express or implied, including but not limited to warranties of merchantability,
                fitness for a particular purpose, or non-infringement. The developer does not
                warrant that the app will be error-free, uninterrupted, or meet your specific
                requirements. As an experimental environment, phytoexp may be particularly unstable.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">9. Limitation of Liability</h2>
              <p className="mt-2 uppercase">
                To the fullest extent permitted by applicable law, the developer shall not be liable
                for any indirect, incidental, special, consequential, or punitive damages, including
                but not limited to loss of data, loss of content, or interruption of service,
                arising from your use of or inability to use the app.
              </p>
              <p className="mt-2">
                Because all data in offline mode is stored locally in your browser, the developer
                has no access to your content and cannot be held responsible for any loss of data
                resulting from browser clearing, device failure, or software updates.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">10. Acceptable Use</h2>
              <p className="mt-2">
                You agree to use phytoexp only for lawful purposes. You agree not to:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>Infringe any copyright, trademark, or other intellectual property right</li>
                <li>Display unlicensed content in violation of applicable law</li>
                <li>Attempt to reverse-engineer or interfere with the app in a harmful manner</li>
                <li>Redistribute phyto under a more restrictive license than GPL-3.0</li>
                <li>Charge others for access to phyto or any unmodified version of it</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl">11. Changes to the App and Terms</h2>
              <p className="mt-2">
                We reserve the right to modify, suspend, or discontinue the app at any time without
                notice. We may also update these Terms from time to time. Continued use of the app
                after any changes constitutes your acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">12. Governing Law</h2>
              <p className="mt-2">
                These Terms shall be governed by and construed in accordance with the laws of
                British Columbia, Canada, without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">13. Contact</h2>
              <p className="mt-2">
                Questions about these Terms can be submitted via the feedback form at{" "}
                <Link to="/feedback" className="underline hover:opacity-60">
                  phytoexp.live/feedback
                </Link>
                , or by reaching out on Instagram at{" "}
                <a
                  href="https://www.instagram.com/phyto.live"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-60"
                >
                  instagram.com/phyto.live
                </a>
                .
              </p>
            </section>
          </div>
        </TabsContent>

        {/* ONLINE TAB */}
        <TabsContent value="online">
          <div className="mt-6 space-y-6 text-base leading-relaxed opacity-90">
            <p>
              These additional terms apply when you create an account and use phytoexp's online
              features. By signing in, you agree to both the offline terms above and the following.
            </p>

            <section>
              <h2 className="text-2xl">1. Accounts</h2>
              <p className="mt-2">
                Creating an account is optional. You may sign in using a one-time code sent to your
                email address, or via Google OAuth. You are responsible for maintaining the security
                of your account. phyto currently supports one account per email address. The app is
                fully usable without an account. Creating one unlocks cross-device sync, live
                sharing, and media uploads.
              </p>
              <p className="mt-2">
                When you first sign in, we send you a one-time welcome email. Product-update emails
                are sent only if you opt in at sign-in, and you can unsubscribe at any time using
                the link in any such email.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">2. Cross-Device Sync</h2>
              <p className="mt-2">
                When signed in, your catalogue is automatically synced to Supabase so it stays up to
                date across your devices. When signing in on a new device, you will be prompted to
                resolve any differences between your local and cloud data. You are responsible for
                choosing how to resolve those conflicts. phyto uses last-write-wins for automatic
                conflict resolution and is not liable for data loss resulting from sync conflicts.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">3. Live Sharing</h2>
              <p className="mt-2">
                When you start a live session, a unique public URL and QR code are generated for
                your gathering. Anyone with that link can view your gathering content. You are
                solely responsible for all content you share publicly via this feature. phyto does
                not review or moderate publicly shared content. The live session and public link
                remain active until you choose to end the session or start a new one.
              </p>
              <p className="mt-2">
                If you use the live sharing feature to publicly display copyrighted content such as
                song lyrics, you remain solely responsible for holding the appropriate licences as
                described in the offline Terms section 6.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">4. Uploaded Media</h2>
              <p className="mt-2">
                Signed-in users can upload short video clips for use as slide media. Uploaded videos
                are stored on our servers (Cloudflare R2), subject to a limit of 100 MB per file and
                300 MB total per account. Each uploaded file is served from a public, unguessable
                URL and is not access-controlled, so you should treat anything you upload as
                potentially viewable by anyone who obtains the link.
              </p>
              <p className="mt-2">
                You are solely responsible for the content you upload and for holding any licences
                required to store or display it, as described in the offline Terms section 6. You
                agree not to upload content that is unlawful, infringing, malicious, or that you do
                not have the right to use. phyto does not review or moderate uploaded media but may
                remove content and reserves the right to suspend accounts that abuse this feature.
              </p>
              <p className="mt-2">
                You can delete an uploaded video at any time by removing the slide that uses it,
                which also frees up your storage quota.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">5. Account Termination</h2>
              <p className="mt-2">
                You may request deletion of your account and all associated cloud data at any time
                by contacting us via the feedback form at{" "}
                <Link to="/feedback" className="underline hover:opacity-60">
                  phytoexp.live/feedback
                </Link>
                . We will process deletion requests within 30 days. Deleting your account removes
                your data from Supabase and any video media you uploaded to Cloudflare R2, but does
                not affect data stored locally on your devices.
              </p>
              <p className="mt-2">
                We reserve the right to suspend or terminate accounts that violate these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">6. Disclaimer of Warranties</h2>
              <p className="mt-2 uppercase">
                Online features including sync, live sharing, and media uploads are provided "as is"
                without warranty of any kind. The developer does not guarantee uninterrupted sync,
                data integrity across devices, retention of uploaded media, or availability of
                online features at any given time.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">7. Limitation of Liability</h2>
              <p className="mt-2 uppercase">
                To the fullest extent permitted by applicable law, the developer shall not be liable
                for any loss of data, sync conflicts, or damages arising from the use of online
                features including cross-device sync, live sharing, media uploads, or account
                authentication.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">8. Acceptable Use</h2>
              <p className="mt-2">
                In addition to the acceptable use terms in the offline section, you agree not to:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>Attempt to access another user's account, catalogue, or gatherings</li>
                <li>
                  Use the live sharing feature to publicly distribute unlicensed copyrighted content
                </li>
                <li>
                  Upload media that is unlawful, infringing, malicious, or that you do not have the
                  right to use
                </li>
                <li>
                  Use automated tools to create accounts or abuse the sync, storage, or email
                  infrastructure
                </li>
                <li>Share your account credentials with others</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl">9. Changes to Online Terms</h2>
              <p className="mt-2">
                We may update these online terms from time to time. We will make reasonable efforts
                to notify signed-in users of significant changes. Continued use of online features
                after any update constitutes acceptance of the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">10. Governing Law</h2>
              <p className="mt-2">
                These Terms shall be governed by and construed in accordance with the laws of
                British Columbia, Canada, without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-2xl">11. Contact</h2>
              <p className="mt-2">
                Questions about these Terms can be submitted via the feedback form at{" "}
                <Link to="/feedback" className="underline hover:opacity-60">
                  phytoexp.live/feedback
                </Link>
                , or by reaching out on Instagram at{" "}
                <a
                  href="https://www.instagram.com/phyto.live"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-60"
                >
                  instagram.com/phyto.live
                </a>
                .
              </p>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
