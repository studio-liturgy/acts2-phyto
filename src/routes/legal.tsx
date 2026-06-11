import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRootBackground } from "@/hooks/use-root-background";
import { APP_NAME } from "@/lib/appConfig";
import TermsTest from "@/content/terms-test";
import TermsMain from "@/content/terms-main";
import PrivacyTest from "@/content/privacy-test";
import PrivacyMain from "@/content/privacy-main";

const isTest = import.meta.env.VITE_APP_ENV === 'test';
const domain = isTest ? "https://phytoexp.live" : "https://phyto.live";

const TermsBody = isTest ? TermsTest : TermsMain;
const PrivacyBody = isTest ? PrivacyTest : PrivacyMain;

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: `Legal | ${APP_NAME}` },
      { name: "description", content: `Terms of Use and Privacy Policy for ${APP_NAME}.` },
      { property: "og:title", content: `Legal | ${APP_NAME}` },
      { property: "og:description", content: `Terms of Use and Privacy Policy for ${APP_NAME}.` },
      { property: "og:url", content: `${domain}/legal` },
    ],
    links: [
      { rel: "canonical", href: `${domain}/legal` },
    ],
  }),
  component: Legal,
});

const triggerCls = isTest
  ? "mono pill rounded-full border-2 border-white bg-transparent px-4 py-1.5 text-xs uppercase tracking-wider text-white transition hover:bg-white hover:text-[var(--brand-orange)] data-[state=active]:bg-white data-[state=active]:text-[var(--brand-orange)] data-[state=active]:shadow-none"
  : "mono pill rounded-full border-2 border-white bg-transparent px-4 py-1.5 text-xs uppercase tracking-wider text-white transition hover:bg-white hover:text-[var(--brand-blue)] data-[state=active]:bg-white data-[state=active]:text-[var(--brand-blue)] data-[state=active]:shadow-none";

function Legal() {
  useRootBackground(isTest && "var(--brand-orange-dark)");
  const { hash } = useLocation();
  const doc = hash.includes('privacy') ? 'privacy' : 'terms';
  const section: 'offline' | 'online' = hash.includes('online') ? 'online' : 'offline';

  return (
    <div className={`flex min-h-screen flex-col ${isTest ? 'bg-[var(--brand-orange-dark)]' : 'bg-[var(--brand-blue)]'} text-[var(--brand-white)]`}>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link to="/" className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60">
          <ArrowLeft className="h-3 w-3" /> BACK
        </Link>
        <h1 className="mt-6 text-5xl">Legal</h1>

        <Tabs defaultValue={doc} className="mt-8">
          <TabsList className="h-auto gap-2 rounded-none bg-transparent p-0">
            <TabsTrigger value="terms" className={triggerCls}>Terms of Use</TabsTrigger>
            <TabsTrigger value="privacy" className={triggerCls}>Privacy Policy</TabsTrigger>
          </TabsList>

          <TabsContent value="terms" className="mt-3">
            <TermsBody defaultSection={section} />
          </TabsContent>
          <TabsContent value="privacy" className="mt-3">
            <PrivacyBody defaultSection={section} />
          </TabsContent>
        </Tabs>

        <div className="mt-12">
          <BackToTop />
        </div>
      </main>
      <Footer />
    </div>
  );
}
