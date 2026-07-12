import { createFileRoute, useLocation } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";
import { APP_NAME } from "@/lib/appConfig";
import TermsTest from "@/content/terms-test";
import TermsMain from "@/content/terms-main";

const isTest = import.meta.env.VITE_APP_ENV === "test";
const domain = isTest ? "https://phytoexp.live" : "https://phyto.live";
const TermsBody = isTest ? TermsTest : TermsMain;

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Terms of Use | ${APP_NAME}` },
      { name: "description", content: `Terms of Use for ${APP_NAME}.` },
      { property: "og:title", content: `Terms of Use | ${APP_NAME}` },
      { property: "og:description", content: `Terms of Use for ${APP_NAME}.` },
      { property: "og:url", content: `${domain}/terms` },
    ],
    links: [{ rel: "canonical", href: `${domain}/terms` }],
  }),
  component: Terms,
});

function Terms() {
  const { hash } = useLocation();
  const section: "offline" | "online" = hash.includes("online") ? "online" : "offline";
  return (
    <LegalLayout active="terms">
      <TermsBody defaultSection={section} />
    </LegalLayout>
  );
}
