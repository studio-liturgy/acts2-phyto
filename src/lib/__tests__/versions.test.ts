import { describe, expect, it } from "vitest";
import { hasStackedVersions, visibleVersions } from "@/lib/versions";
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
        { multiLanguage: true, language: "en" },
      ),
    ).toBeUndefined();
    const plain: Slide = { id: "x", kind: "scripture", lines: ["plain"] };
    expect(
      visibleVersions({ slides: [plain] }, { multiLanguage: true, language: "en" }),
    ).toBeUndefined();
    expect(hasStackedVersions(stacked)).toBe(true);
  });

  it("shows every version when the workspace is multi-language", () => {
    expect(visibleVersions(stacked, { multiLanguage: true, language: "en" })).toEqual([
      "NIV",
      "CUNPS",
    ]);
  });

  it("shows the version in the workspace language when multi-language is off", () => {
    expect(visibleVersions(stacked, { multiLanguage: false, language: "en" })).toEqual(["NIV"]);
    expect(visibleVersions(stacked, { multiLanguage: false, language: "zh-Hans" })).toEqual([
      "CUNPS",
    ]);
  });

  it("falls back to the set's primary when no version is in the workspace language", () => {
    expect(visibleVersions(stacked, { multiLanguage: false, language: "ko" })).toEqual(["NIV"]);
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
