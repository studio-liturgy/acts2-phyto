import { createFileRoute } from "@tanstack/react-router";
import TermsTest from "@/content/terms-test";
import TermsMain from "@/content/terms-main";

const isTest = import.meta.env.VITE_APP_ENV === 'test';

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: isTest ? "Terms of Use | phytoexp" : "Terms of Use | phyto" },
      { name: "description", content: isTest ? "Terms of use for phytoexp." : "Terms of use for phyto." },
      { property: "og:title", content: isTest ? "Terms of Use | phytoexp" : "Terms of Use | phyto" },
      { property: "og:description", content: isTest ? "Terms of use for phytoexp." : "Terms of use for phyto." },
      { property: "og:url", content: isTest ? "https://phytoexp.live/terms" : "https://phyto.live/terms" },
    ],
    links: [
      { rel: "canonical", href: isTest ? "https://phytoexp.live/terms" : "https://phyto.live/terms" },
    ],
  }),
  component: isTest ? TermsTest : TermsMain,
});
