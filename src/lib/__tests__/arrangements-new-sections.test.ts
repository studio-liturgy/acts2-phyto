import { describe, expect, it } from "vitest";
import { arrangedEntries, effectiveArrangement, storedArrangement } from "../arrangements";

const lyric = (id: string, section?: string) => ({ id, kind: "lyric", section });

describe("sections added to a song after its arrangement was changed", () => {
  it("bug report: one-section song, arranged, then a section is added", () => {
    const before = [lyric("v", "Verse")];
    // Leader repeats the verse in the gathering: the arrangement is stored.
    const stored = storedArrangement(["Verse#0", "Verse#0"], before);
    // The song is edited: a Section is added after the verse.
    const after = [...before, lyric("s", "Section")];
    expect(effectiveArrangement(after, stored)).toEqual(["Verse#0", "Section#0", "Verse#0"]);
    // Phones use the same resolved order.
    expect(
      arrangedEntries(after, effectiveArrangement(after, stored)).map((e) => e.entryKey),
    ).toEqual(["Verse#0@0", "Section#0@0", "Verse#0@1"]);
  });

  it("lands right after the first time the section written before it plays", () => {
    const before = [lyric("v1", "Verse 1"), lyric("c", "Chorus"), lyric("v2", "Verse 2")];
    const stored = storedArrangement(["Chorus#0", "Verse 1#0", "Chorus#0", "Verse 2#0"], before);
    const after = [
      lyric("v1", "Verse 1"),
      lyric("p", "Pre-chorus"),
      lyric("c", "Chorus"),
      lyric("v2", "Verse 2"),
    ];
    expect(effectiveArrangement(after, stored)).toEqual([
      "Chorus#0",
      "Verse 1#0",
      "Pre-chorus#0",
      "Chorus#0",
      "Verse 2#0",
    ]);
  });

  it("keeps consecutive new sections in written order", () => {
    const before = [lyric("v", "Verse")];
    const stored = storedArrangement(["Verse#0", "Verse#0"], before);
    const after = [lyric("v", "Verse"), lyric("a", "A"), lyric("b", "B")];
    expect(effectiveArrangement(after, stored)).toEqual(["Verse#0", "A#0", "B#0", "Verse#0"]);
  });

  it("a new section at the top plays first", () => {
    const before = [lyric("v", "Verse")];
    const stored = storedArrangement(["Verse#0", "Verse#0"], before);
    const after = [lyric("i", "Intro"), lyric("v", "Verse")];
    expect(effectiveArrangement(after, stored)).toEqual(["Intro#0", "Verse#0", "Verse#0"]);
  });

  it("a new section whose written neighbour was removed follows the nearest one still playing", () => {
    const before = [lyric("v", "Verse"), lyric("c", "Chorus")];
    const stored = storedArrangement(["Chorus#0"], before);
    const after = [lyric("v", "Verse"), lyric("b", "Bridge"), lyric("c", "Chorus")];
    expect(effectiveArrangement(after, stored)).toEqual(["Bridge#0", "Chorus#0"]);
  });

  it("a section the leader removed stays removed", () => {
    const before = [lyric("v", "Verse"), lyric("c", "Chorus")];
    const stored = storedArrangement(["Verse#0"], before);
    expect(effectiveArrangement(before, stored)).toEqual(["Verse#0"]);
    const after = [...before, lyric("b", "Bridge")];
    expect(effectiveArrangement(after, stored)).toEqual(["Verse#0", "Bridge#0"]);
  });

  it("arrangements saved before this change are read as before", () => {
    const after = [lyric("v", "Verse"), lyric("c", "Chorus")];
    expect(effectiveArrangement(after, ["Verse#0"])).toEqual(["Verse#0"]);
  });

  it("the stored form only adds marker entries that older builds skip", () => {
    const song = [lyric("v", "Verse"), lyric("c", "Chorus")];
    const stored = storedArrangement(["Chorus#0"], song);
    expect(stored[0]).toBe("Chorus#0");
    // An older build filters stored keys against the song's sections.
    expect(arrangedEntries(song, stored).map((e) => e.entryKey)).toEqual(["Chorus#0@0"]);
  });
});
