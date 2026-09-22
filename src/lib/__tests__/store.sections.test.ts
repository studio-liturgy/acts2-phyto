import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { useLibrary } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import type { Set as PhytoSet, Slide } from "@/lib/types";

const slide = (id: string, extra: Partial<Slide> = {}): Slide => ({
  id,
  kind: "image",
  lines: [],
  imageUrl: `https://media.example/${id}.png`,
  ...extra,
});

function mediaSet(slides: Slide[]): PhytoSet {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Announcements",
    kind: "media",
    slides,
    createdAt: 1,
    updatedAt: 1,
  } as PhytoSet;
}

beforeEach(async () => {
  useAuthStore.setState({ session: fakeSession });
  await resetDb();
});

describe("media sections survive removing and reordering slides", () => {
  it("removing the first slide hands the first section's name to the new first slide", () => {
    const set = mediaSet([
      slide("a", { sectionBefore: "Welcome" }),
      slide("b"),
      slide("c", { sectionAfter: "Notices" }),
      slide("d"),
    ]);
    useLibrary.setState({ sets: { [set.id]: set }, order: [set.id] });

    useLibrary.getState().removeSlide(set.id, "a");

    const slides = useLibrary.getState().sets[set.id].slides;
    expect(slides.map((s) => s.id)).toEqual(["b", "c", "d"]);
    expect(slides[0].sectionBefore).toBe("Welcome");
    expect(slides[1].sectionAfter).toBe("Notices");
  });

  it("reordering keeps the first section's name on whichever slide is first", () => {
    const set = mediaSet([slide("a", { sectionBefore: "Welcome" }), slide("b"), slide("c")]);
    useLibrary.setState({ sets: { [set.id]: set }, order: [set.id] });

    useLibrary.getState().reorderSlides(set.id, ["b", "a", "c"]);

    const slides = useLibrary.getState().sets[set.id].slides;
    expect(slides.map((s) => [s.id, s.sectionBefore])).toEqual([
      ["b", "Welcome"],
      ["a", undefined],
      ["c", undefined],
    ]);
  });
});
