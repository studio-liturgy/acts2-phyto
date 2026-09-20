import { it, expect } from "vitest";
import { WORKSPACE_LANGS, workspaceLang, workspaceLangLabel } from "@/lib/langs";
it("offers one Chinese (both scripts) and no transliterations", () => {
  expect(WORKSPACE_LANGS.map((l) => l.code)).toEqual([
    "en",
    "ja",
    "zh-Hans",
    "ko",
    "ar",
    "id",
    "es",
    "pt",
    "fr",
  ]);
  expect(workspaceLang("zh-Hant")).toBe("zh-Hans");
  expect(workspaceLangLabel("zh-Hans")).toBe("Chinese");
});
