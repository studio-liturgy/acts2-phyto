import { it, expect } from "vitest";
import { WORKSPACE_LANGS } from "@/lib/langs";
it("lists both Chinese scripts", () => {
  expect(WORKSPACE_LANGS.map((l) => l.code)).toEqual([
    "en",
    "ja",
    "zh-Hans",
    "zh-Hant",
    "ko",
    "ar",
    "id",
    "es",
    "pt",
    "fr",
  ]);
});
