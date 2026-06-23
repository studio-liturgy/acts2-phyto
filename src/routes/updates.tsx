import { createFileRoute } from "@tanstack/react-router";
import UpdatesTest from "@/content/updates-test";
import UpdatesMain from "@/content/updates-main";

const isTest = import.meta.env.VITE_APP_ENV === 'test';

export const Route = createFileRoute("/updates")({
  head: () => ({
    meta: [
      { title: isTest ? "Test Notes | phytoexp" : "Updates | phyto" },
      { name: "description", content: isTest ? "Features being tested and known issues on phytoexp." : "Release notes and updates for phyto." },
      { property: "og:title", content: isTest ? "Test Notes | phytoexp" : "Updates | phyto" },
      { property: "og:description", content: isTest ? "Features being tested and known issues on phytoexp." : "Release notes and updates for phyto." },
      { property: "og:url", content: isTest ? "https://phytoexp.live/updates" : "https://phyto.live/updates" },
    ],
    links: [
      { rel: "canonical", href: isTest ? "https://phytoexp.live/updates" : "https://phyto.live/updates" },
    ],
  }),
  component: isTest ? UpdatesTest : UpdatesMain,
});
