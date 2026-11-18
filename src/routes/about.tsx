import { createFileRoute } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { APP_NAME } from "@/lib/appConfig";
import AboutTest from "@/content/about-test";
import AboutMain from "@/content/about-main";
import loginBgOr from "@/assets/login-bg-or.jpg";
import aboutBgMain from "@/assets/about-bg.jpg";
import { isNativeApp } from "@/lib/native-app";

const isTest = import.meta.env.VITE_APP_ENV === "test";
const aboutBg = isTest ? loginBgOr : aboutBgMain;

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
  component: AboutPage,
});

const noSubscribe = () => () => {};

/** The phyto app shows the regular About page even though test builds load
 *  phytoexp.live: testers in the app are using phyto, not the test site. The
 *  server can't know it's the app, so it renders the web version and the app
 *  switches on hydration. */
function AboutPage() {
  const inApp = useSyncExternalStore(noSubscribe, isNativeApp, () => false);
  return isTest && !inApp ? <AboutTest /> : <AboutMain />;
}
