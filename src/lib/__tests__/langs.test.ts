import { describe, it, expect } from "vitest";
import {
  LANGS,
  WORKSPACE_LANGS,
  langCodeForTag,
  sanitiseLangs,
  toLangCode,
  workspaceLang,
  workspaceLangLabel,
} from "@/lib/langs";
import { YV_BIBLES } from "@/lib/youversion";

it("offers one Chinese (both scripts) and no transliterations", () => {
  expect(WORKSPACE_LANGS.map((l) => l.code)).toEqual([
    "en",
    "ja",
    "zh",
    "ko",
    "ar",
    "id",
    "es",
    "pt",
    "fr",
  ]);
  expect(workspaceLang("zh-Hant-TW")).toBe("zh");
  expect(workspaceLangLabel("zh")).toBe("Chinese");
});

describe("language codes are YouVersion's tags", () => {
  const tags = new Set(YV_BIBLES.map((b) => b.tag));

  it("every language has Bibles under exactly its code", () => {
    for (const l of LANGS)
      if (!l.derivedFrom || l.code === "zh-Hant-TW") expect(tags).toContain(l.code);
  });

  it("a transliteration is its source's tag plus a script", () => {
    for (const l of LANGS) {
      if (!l.derivedFrom || l.code === "zh-Hant-TW") continue;
      expect(l.code).toMatch(new RegExp(`^${l.derivedFrom}-[A-Z][a-z]{3}$`));
      expect(Intl.getCanonicalLocales(l.code)).toEqual([l.code]);
    }
  });
});

describe("old codes", () => {
  it("read as today's", () => {
    expect(toLangCode("zh-Hans")).toBe("zh");
    expect(toLangCode("zh-Hant")).toBe("zh-Hant-TW");
    expect(toLangCode("ko")).toBe("ko");
    expect(toLangCode("xx")).toBeUndefined();
    expect(toLangCode(7)).toBeUndefined();
    expect(sanitiseLangs(["zh-Hans", "zh", "zh-Hant", "nope", "en"])).toEqual([
      "zh",
      "zh-Hant-TW",
      "en",
    ]);
  });
});

describe("langCodeForTag", () => {
  it("finds the entry a Bible's tag is typeset with", () => {
    expect(langCodeForTag("ko")).toBe("ko");
    expect(langCodeForTag("zh")).toBe("zh");
    expect(langCodeForTag("zh-Hant-TW")).toBe("zh-Hant-TW");
    expect(langCodeForTag("zh-Hant-HK")).toBe("zh-Hant-TW");
    expect(langCodeForTag("es-ES")).toBe("es");
    expect(langCodeForTag("pt-PT")).toBe("pt");
  });

  it("knows nothing of a language phyto has no entry for, or another script", () => {
    expect(langCodeForTag("cak")).toBeUndefined();
    expect(langCodeForTag("ar-Latn")).toBeUndefined();
  });
});
