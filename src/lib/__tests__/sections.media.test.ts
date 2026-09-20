import { describe, expect, it } from "vitest";
import { groupSlides } from "@/lib/sections";

describe("media sections from dividers", () => {
  const slides = [
    { id: "a", kind: "image" },
    { id: "b", kind: "video", sectionAfter: "Worship" },
    { id: "c", kind: "image" },
    { id: "d", kind: "image", sectionAfter: "" },
    { id: "e", kind: "video" },
  ];

  it("opens a new group after each divider, labelled by the divider", () => {
    const groups = groupSlides(slides);
    expect(groups.map((g) => g.items.map((i) => i.slide.id))).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    expect(groups.map((g) => g.section)).toEqual([null, "Worship", null]);
    // Distinct keys even for two unlabelled sections.
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
  });

  it("keeps a media set without dividers as one group", () => {
    expect(groupSlides([{ kind: "image" }, { kind: "video" }])).toHaveLength(1);
  });
});
