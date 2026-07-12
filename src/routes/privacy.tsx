import { createFileRoute, useLocation } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";
import { APP_NAME } from "@/lib/appConfig";
import PrivacyTest from "@/content/privacy-test";
import PrivacyMain from "@/content/privacy-main";

const isTest = import.meta.env.VITE_APP_ENV === "test";
const domain = isTest ? "https://phytoexp.live" : "https://phyto.live";
const PrivacyBody = isTest ? PrivacyTest : PrivacyMain;

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Policy | ${APP_NAME}` },
      { name: "description", content: `How ${APP_NAME} collects, stores, and uses your data.` },
      { property: "og:title", content: `Privacy Policy | ${APP_NAME}` },
      {
        property: "og:description",
        content: `How ${APP_NAME} collects, stores, and uses your data.`,
      },
      { property: "og:url", content: `${domain}/privacy` },
    ],
    links: [{ rel: "canonical", href: `${domain}/privacy` }],
  }),
  component: Privacy,
});

function Privacy() {
  const { hash } = useLocation();
  const section: "offline" | "online" = hash.includes("online") ? "online" : "offline";
  return (
    <LegalLayout active="privacy">
      <PrivacyBody defaultSection={section} />
    </LegalLayout>
  );
}
