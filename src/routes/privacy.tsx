import { createFileRoute } from "@tanstack/react-router";
import PrivacyTest from "@/content/privacy-test";
import PrivacyMain from "@/content/privacy-main";

const isTest = import.meta.env.VITE_APP_ENV === 'test';

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: isTest ? "Privacy Policy | phytoexp" : "Privacy Policy | phyto" },
      { name: "description", content: isTest ? "Privacy policy for phytoexp." : "Privacy policy for phyto." },
      { property: "og:title", content: isTest ? "Privacy Policy | phytoexp" : "Privacy Policy | phyto" },
      { property: "og:description", content: isTest ? "Privacy policy for phytoexp." : "Privacy policy for phyto." },
      { property: "og:url", content: isTest ? "https://phytoexp.live/privacy" : "https://phyto.live/privacy" },
    ],
    links: [
      { rel: "canonical", href: isTest ? "https://phytoexp.live/privacy" : "https://phyto.live/privacy" },
    ],
  }),
  component: isTest ? PrivacyTest : PrivacyMain,
});
