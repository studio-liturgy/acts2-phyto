import { describe, expect, it } from "vitest";
import {
  hasStackedVersions,
  inferredVersions,
  reimportQueries,
  versionsMismatchWorkspace,
  visibleVersions,
} from "@/lib/versions";
import { slidesToVersionText, versionTextToSlides } from "@/lib/slide-text";
import type { Slide } from "@/lib/types";

const verse = (id: string, en: string, zh: string): Slide => ({
  id,
  kind: "scripture",
  reference: "John 3:16",
  section: "John 3:16",
  importIndex: 0,
  lines: [en],
  linesByVersion: { NIV: en, CUNPS: zh },
  referencesByVersion: { NIV: "John 3:16", CUNPS: "約翰福音 3:16" },
});
const stacked = {
  versions: ["NIV", "CUNPS"],
  slides: [verse("a", "For God so loved", "神愛世人")],
};

describe("visibleVersions", () => {
  it("is undefined for a set that doesn't stack (renders from lines)", () => {
    expect(
      visibleVersions(
        { versions: ["NIV"], slides: stacked.slides },
        { multiLanguage: true, language: "en", language2: "zh-Hans" },
      ),
    ).toBeUndefined();
    const plain: Slide = { id: "x", kind: "scripture", lines: ["plain"] };
    expect(
      visibleVersions(
        { slides: [plain] },
        { multiLanguage: true, language: "en", language2: "zh-Hans" },
      ),
    ).toBeUndefined();
    expect(hasStackedVersions(stacked)).toBe(true);
  });

  it("multi-language: the set's versions in the workspace's languages, in the set's order", () => {
    expect(
      visibleVersions(stacked, { multiLanguage: true, language: "en", language2: "zh-Hans" }),
    ).toEqual(["NIV", "CUNPS"]);
    // The SET's order rules (a swap in the editor flips it), not the workspace's.
    expect(
      visibleVersions(stacked, { multiLanguage: true, language: "zh-Hans", language2: "en" }),
    ).toEqual(["NIV", "CUNPS"]);
    expect(
      visibleVersions(
        { versions: ["CUNPS", "NIV"], slides: stacked.slides },
        { multiLanguage: true, language: "en", language2: "zh-Hans" },
      ),
    ).toEqual(["CUNPS", "NIV"]);
    // A set outside the workspace's languages (warned) still shows all it has.
    expect(
      visibleVersions(stacked, { multiLanguage: true, language: "en", language2: "ko" }),
    ).toEqual(["NIV", "CUNPS"]);
    // Neither present (imported elsewhere): everything the set carries.
    expect(
      visibleVersions(stacked, { multiLanguage: true, language: "ja", language2: "ko" }),
    ).toEqual(["NIV", "CUNPS"]);
  });

  it("shows the version in the workspace language when multi-language is off", () => {
    expect(
      visibleVersions(stacked, { multiLanguage: false, language: "en", language2: null }),
    ).toEqual(["NIV"]);
    expect(
      visibleVersions(stacked, { multiLanguage: false, language: "zh-Hans", language2: null }),
    ).toEqual(["CUNPS"]);
  });

  it("shows everything the set has when no version is in the system language", () => {
    expect(
      visibleVersions(stacked, { multiLanguage: false, language: "ko", language2: null }),
    ).toEqual(["NIV", "CUNPS"]);
  });
});

describe("version boxes round-trip", () => {
  it("rebuilds the same verses from the per-version boxes", () => {
    const boxes = slidesToVersionText(stacked.slides, stacked.versions);
    expect(boxes.NIV).toBe("[John 3:16]\nFor God so loved");
    expect(boxes.CUNPS).toBe("[約翰福音 3:16]\n神愛世人");
    const rebuilt = versionTextToSlides(boxes, stacked.versions);
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].linesByVersion).toEqual({ NIV: "For God so loved", CUNPS: "神愛世人" });
    expect(rebuilt[0].referencesByVersion).toEqual({ NIV: "John 3:16", CUNPS: "約翰福音 3:16" });
    expect(rebuilt[0].lines).toEqual(["For God so loved"]);
  });
});

describe("versionsMismatchWorkspace", () => {
  const off = (language: "en" | "fr" | "zh-Hant") =>
    ({ multiLanguage: false, language, language2: null }) as const;
  const on = (language: "en" | "fr" | "zh-Hant", language2: "en" | "fr" | "ja") =>
    ({ multiLanguage: true, language, language2 }) as const;

  it("off: fine when the set has the system language, extras included", () => {
    expect(versionsMismatchWorkspace(["FRLSG", "NIV"], off("en"))).toBe(false);
    expect(versionsMismatchWorkspace(["NIV", "ESV"], off("en"))).toBe(false);
    expect(versionsMismatchWorkspace(["FRLSG"], off("en"))).toBe(true);
    expect(versionsMismatchWorkspace(["CUNPS"], off("zh-Hant"))).toBe(true);
  });

  it("multi: fine when every version is one of the two languages, one version included", () => {
    expect(versionsMismatchWorkspace(["NIV", "FRLSG"], on("fr", "en"))).toBe(false);
    expect(versionsMismatchWorkspace(["NIV"], on("fr", "en"))).toBe(false);
    expect(versionsMismatchWorkspace(["CUNPS", "NIV"], on("fr", "en"))).toBe(true);
    expect(versionsMismatchWorkspace(["CUNPS"], on("fr", "en"))).toBe(true);
    expect(versionsMismatchWorkspace(undefined, on("fr", "en"))).toBe(false);
  });
});

describe("legacy single-version sets", () => {
  const legacy = {
    kind: "scripture",
    slides: [
      { id: "a", kind: "scripture", reference: "Psalms 100:4 NIV", lines: ["Enter his gates"] },
      { id: "b", kind: "scripture", reference: "Psalms 100:4 NIV", lines: ["with thanksgiving"] },
      { id: "c", kind: "scripture", reference: "John 3:16 NIV", lines: ["For God"] },
    ],
  };

  it("reads the version off the reference label", () => {
    expect(inferredVersions(legacy)).toEqual(["NIV"]);
    expect(
      versionsMismatchWorkspace(inferredVersions(legacy), {
        multiLanguage: false,
        language: "zh-Hant",
        language2: null,
      }),
    ).toBe(true);
  });

  it("re-imports from the recorded queries, else the references without the label", () => {
    expect(reimportQueries(legacy)).toEqual(["Psalms 100:4", "John 3:16"]);
    expect(reimportQueries({ ...legacy, scriptureImports: ["Ps 100", "Jn 3:16-18"] })).toEqual([
      "Ps 100",
      "Jn 3:16-18",
    ]);
  });
});
