import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — phyto" },
      { name: "description", content: "Privacy policy for phyto." },
      { property: "og:title", content: "Privacy Policy — phyto" },
      { property: "og:description", content: "Privacy policy for phyto." },
      { property: "og:url", content: "https://phyto.live/privacy" },
    ],
    links: [
      { rel: "canonical", href: "https://phyto.live/privacy" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--brand-blue)] text-[var(--brand-white)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"><ArrowLeft className="h-3 w-3" /> BACK</Link>
        <h1 className="mt-6 text-5xl">Privacy Policy</h1>
        <p className="mono mt-2 text-xs uppercase tracking-wider opacity-70">Effective Date: May 21, 2026</p>

        <div className="mt-8 space-y-6 text-base leading-relaxed opacity-90">
          <p>
            This Privacy Policy describes how Phyto ("the App", "we", "our") handles information when you use our web application at{" "}
            <a href="https://phyto.live/" className="underline hover:opacity-60">https://phyto.live/</a> or as a downloaded offline application.
          </p>

          <section>
            <h2 className="text-2xl">1. No Account or Personal Data Collected</h2>
            <p className="mt-2">Phyto does not require registration, login, or the creation of an account. We do not collect personal information such as your name, email address, or device identifiers through normal use of the App.</p>
          </section>

          <section>
            <h2 className="text-2xl">2. Local Storage Only</h2>
            <p className="mt-2">All content you create in Phyto — songs, scripture references, gatherings, sets, and media — is stored exclusively in your browser's local storage on your own device. This data:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Never leaves your device</li>
              <li>Is never sent to any server</li>
              <li>Is not accessible to the developer or any third party</li>
              <li>May be lost if you clear your browser data or uninstall the offline app</li>
            </ul>
            <p className="mt-2">We strongly recommend periodically exporting or backing up your content to avoid data loss.</p>
          </section>

          <section>
            <h2 className="text-2xl">3. Feedback Form</h2>
            <p className="mt-2">Phyto includes an optional feedback form at <Link to="/feedback" className="underline hover:opacity-60">phyto.live/feedback</Link>. If you choose to submit feedback, the content of your message (and any contact information you voluntarily include) is transmitted to the developer via a third-party messaging or email service. This information is used solely to respond to your feedback and improve the App. We do not share it with any other parties.</p>
            <p className="mt-2">Positive feedback such as testimonies and encouragement may be shared publicly on Phyto's social media channels (e.g. Instagram). Personally sensitive information will not be shared publicly. Submitting feedback is entirely optional and not required to use any feature of the App.</p>
          </section>

          <section>
            <h2 className="text-2xl">4. Analytics &amp; Tracking</h2>
            <p className="mt-2">Phyto does not use cookies, tracking pixels, analytics services, or any other monitoring technology. We do not track your usage, behaviour, or session data in any form.</p>
          </section>

          <section>
            <h2 className="text-2xl">5. Third-Party Hosting</h2>
            <p className="mt-2">The web-hosted version of Phyto is served via Lovable (lovable.dev). Lovable may collect standard server-side logs (such as IP addresses) as part of normal web hosting operations. Please review Lovable's privacy policy at <a href="https://lovable.dev" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60">lovable.dev</a> for details.</p>
            <p className="mt-2">The downloadable offline version of Phyto operates entirely on your device with no network dependency.</p>
          </section>

          <section>
            <h2 className="text-2xl">6. Ko-fi (Donations)</h2>
            <p className="mt-2">The App links to a voluntary donation page hosted by Ko-fi (<a href="https://ko-fi.com/valiantchan" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60">ko-fi.com/valiantchan</a>). If you choose to donate, any payment information you provide is handled entirely by Ko-fi and is subject to Ko-fi's own privacy policy. Phyto does not receive or store your payment details.</p>
          </section>

          <section>
            <h2 className="text-2xl">7. Instagram</h2>
            <p className="mt-2">The App links to Phyto's Instagram profile at <a href="https://www.instagram.com/phyto.live" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-60">instagram.com/phyto.live</a>. Visiting that page is subject to Instagram's privacy policy. Phyto has no control over Instagram's data practices.</p>
          </section>

          <section>
            <h2 className="text-2xl">8. Children's Privacy</h2>
            <p className="mt-2">We do not knowingly collect personal information from anyone, including children. The feedback form should not be submitted by children without parental guidance.</p>
          </section>

          <section>
            <h2 className="text-2xl">9. Changes to This Policy</h2>
            <p className="mt-2">We may update this Privacy Policy from time to time. Updates will be reflected on this page with a revised effective date. Continued use of the App after any change constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-2xl">10. Contact</h2>
            <p className="mt-2">Questions about this Privacy Policy can be submitted via the feedback form at <Link to="/feedback" className="underline hover:opacity-60">phyto.live/feedback</Link>.</p>
          </section>
        </div>
        <div className="mt-12">
          <BackToTop />
        </div>
      </main>
      <Footer />
    </div>
  );
}
