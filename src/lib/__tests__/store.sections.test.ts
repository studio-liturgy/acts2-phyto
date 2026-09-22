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

  // A, B, C | D, E, F: the divider sits on C.
  const sixSlides = () =>
    mediaSet([
      slide("A", { sectionBefore: "One" }),
      slide("B"),
      slide("C", { sectionAfter: "Two" }),
      slide("D"),
      slide("E"),
      slide("F"),
    ]);
  const sections = (id: string) =>
    useLibrary.getState().sets[id].slides.reduce<string[][]>((acc, s, i, all) => {
      if (i === 0 || all[i - 1].sectionAfter !== undefined) acc.push([]);
      acc[acc.length - 1].push(s.id);
      return acc;
    }, []);

  it("a slide dropped between two others joins their section", () => {
    const set = sixSlides();
    useLibrary.setState({ sets: { [set.id]: set }, order: [set.id] });
    // E between B and C.
    useLibrary.getState().reorderSlides(set.id, ["A", "B", "E", "C", "D", "F"]);
    expect(sections(set.id)).toEqual([
      ["A", "B", "E", "C"],
      ["D", "F"],
    ]);
  });

  it("a slide dropped right after a section's last slide opens the next section", () => {
    const set = sixSlides();
    useLibrary.setState({ sets: { [set.id]: set }, order: [set.id] });
    // F between C and D.
    useLibrary.getState().reorderSlides(set.id, ["A", "B", "C", "F", "D", "E"]);
    expect(sections(set.id)).toEqual([
      ["A", "B", "C"],
      ["F", "D", "E"],
    ]);
  });

  it("moving a section's last slide leaves the divider behind instead of sweeping slides along", () => {
    const set = sixSlides();
    useLibrary.setState({ sets: { [set.id]: set }, order: [set.id] });
    // C after E.
    useLibrary.getState().reorderSlides(set.id, ["A", "B", "D", "E", "C", "F"]);
    expect(sections(set.id)).toEqual([
      ["A", "B"],
      ["D", "E", "C", "F"],
    ]);
    const slides = useLibrary.getState().sets[set.id].slides;
    expect(slides[1].sectionAfter).toBe("Two");
    expect(slides[0].sectionBefore).toBe("One");
  });

  it("a section of one slide closes when that slide is moved out", () => {
    const set = mediaSet([
      slide("A"),
      slide("B", { sectionAfter: "Solo" }),
      slide("C", { sectionAfter: "Rest" }),
      slide("D"),
    ]);
    useLibrary.setState({ sets: { [set.id]: set }, order: [set.id] });
    // C (alone in its section) to the end.
    useLibrary.getState().reorderSlides(set.id, ["A", "B", "D", "C"]);
    expect(sections(set.id)).toEqual([
      ["A", "B"],
      ["D", "C"],
    ]);
  });
});
