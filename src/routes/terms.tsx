import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — phyto" },
      { name: "description", content: "Terms of use for phyto." },
      { property: "og:title", content: "Terms of Use — phyto" },
      { property: "og:description", content: "Terms of use for phyto." },
      { property: "og:url", content: "https://phyto.live/terms" },
    ],
    links: [
      { rel: "canonical", href: "https://phyto.live/terms" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"><ArrowLeft className="h-3 w-3" /> Back</Link>
        <h1 className="mt-6 text-5xl">Terms of Use</h1>
        <p className="mono mt-2 text-xs uppercase tracking-wider opacity-70">Effective Date: May 21, 2026</p>

        <div className="mt-8 space-y-6 text-base leading-relaxed opacity-90">
          <p>Please read these Terms of Use carefully before using Phyto. By accessing or using the App, you agree to be bound by these terms.</p>

          <section>
            <h2 className="text-2xl">1. About Phyto</h2>
            <p className="mt-2">Phyto (<a href="https://phyto.live" className="underline hover:opacity-60">phyto.live</a>) is a free, open-source Stage Presenter web application for projecting song lyrics, Bible verses, and custom images during live worship gatherings and presentations. It is available for use online and as a downloadable offline application.</p>
          </section>

          <section>
            <h2 className="text-2xl">2. Always Free</h2>
            <p className="mt-2">Phyto is, and will always remain, free to use. There is no fee, subscription, paywall, or in-app purchase required to access any feature of the App — now or in the future.</p>
          </section>

          <section>
            <h2 className="text-2xl">3. Donations</h2>
            <p className="mt-2">Phyto accepts voluntary donations via Ko-fi at <a href="https://ko-fi.com/valiantchan" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60">ko-fi.com/valiantchan</a>. Donations are entirely optional and greatly appreciated — they help support ongoing development. Donating does not grant any additional features, rights, or privileges, and Phyto will never require payment to access any part of the App.</p>
          </section>

          <section>
            <h2 className="text-2xl">4. Open Source</h2>
            <p className="mt-2">Phyto is open-source software. The source code is made available under the terms of its designated open-source license (see the project repository for details). You are free to use, download, modify, and distribute the software in accordance with that license.</p>
          </section>

          <section>
            <h2 className="text-2xl">5. Music Licensing — Your Responsibility</h2>
            <p className="mt-2">Phyto is a presentation tool only. It does not license, distribute, or authorise the public performance, reproduction, or display of copyrighted musical works.</p>
            <p className="mt-2">If you use Phyto to display song lyrics or other copyrighted content in a public or congregational setting, you are solely responsible for obtaining the appropriate licences. We strongly recommend licensing through one or more of the following, depending on your context:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>CCLI (Christian Copyright Licensing International) — <a href="https://ccli.com" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60">ccli.com</a></li>
              <li>OneLicense — <a href="https://onelicense.net" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60">onelicense.net</a></li>
              <li>LicenSing Online — <a href="https://licensingonline.org" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60">licensingonline.org</a></li>
              <li>Direct licensing from the copyright holder</li>
            </ul>
            <p className="mt-2">The developer of Phyto accepts no liability for any copyright infringement arising from content you choose to display using the App.</p>
          </section>

          <section>
            <h2 className="text-2xl">6. Feedback</h2>
            <p className="mt-2">The feedback form at <Link to="/feedback" className="underline hover:opacity-60">phyto.live/feedback</Link> is provided so users can share bug reports, feature requests, and encouragement. By submitting feedback, you grant the developer a non-exclusive, royalty-free right to use that feedback to improve the App. The developer may share positive feedback (such as testimonies and encouragement) on social media channels, including Instagram. Personally sensitive information will not be shared publicly. Please do not include sensitive personal details in feedback you would not want shared.</p>
          </section>

          <section>
            <h2 className="text-2xl">7. Disclaimer of Warranties</h2>
            <p className="mt-2 uppercase">The App is provided "as is" and "as available", without warranty of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. The developer does not warrant that the App will be error-free, uninterrupted, or meet your specific requirements.</p>
          </section>

          <section>
            <h2 className="text-2xl">8. Limitation of Liability</h2>
            <p className="mt-2 uppercase">To the fullest extent permitted by applicable law, the developer shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, loss of content, or interruption of service, arising from your use of or inability to use the App.</p>
            <p className="mt-2">Because all presentation data is stored locally in your browser, the developer has no access to your content and cannot be held responsible for any loss of data resulting from browser clearing, device failure, or software updates.</p>
          </section>

          <section>
            <h2 className="text-2xl">9. Acceptable Use</h2>
            <p className="mt-2">You agree to use Phyto only for lawful purposes. You agree not to use the App to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Infringe any copyright, trademark, or other intellectual property right</li>
              <li>Display unlicensed content in violation of applicable law</li>
              <li>Attempt to reverse-engineer or interfere with the App in a harmful manner</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl">10. Changes to the App and Terms</h2>
            <p className="mt-2">We reserve the right to modify, suspend, or discontinue the App at any time without notice. We may also update these Terms from time to time. Continued use of the App after any changes constitutes your acceptance of the revised Terms.</p>
          </section>

          <section>
            <h2 className="text-2xl">11. Governing Law</h2>
            <p className="mt-2">These Terms shall be governed by and construed in accordance with applicable law in the jurisdiction in which the developer is located, without regard to conflict of law principles.</p>
          </section>

          <section>
            <h2 className="text-2xl">12. Contact</h2>
            <p className="mt-2">Questions about these Terms can be submitted via the feedback form at <Link to="/feedback" className="underline hover:opacity-60">phyto.live/feedback</Link>, or by reaching out on Instagram at <a href="https://www.instagram.com/phyto.live" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60">instagram.com/phyto.live</a>.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
