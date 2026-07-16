import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/appConfig";
import AboutTest from "@/content/about-test";
import AboutMain from "@/content/about-main";

const isTest = import.meta.env.VITE_APP_ENV === "test";
const aboutBg = "/about-bg.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: `What is ${APP_NAME}?` },
      {
        name: "description",
        content:
          "phyto is a free, open source presentation tool built for small home worship gatherings.",
      },
      { property: "og:title", content: `What is ${APP_NAME}?` },
      {
        property: "og:description",
        content:
          "phyto is a free, open source presentation tool built for small home worship gatherings.",
      },
      {
        property: "og:url",
        content: isTest ? "https://phytoexp.live/about" : "https://phyto.live/about",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: isTest ? "https://phytoexp.live/about" : "https://phyto.live/about",
      },
      { rel: "preload", as: "image", href: aboutBg },
    ],
  }),
  component: isTest ? AboutTest : AboutMain,
});
