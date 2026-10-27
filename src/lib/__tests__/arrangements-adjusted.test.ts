import { describe, expect, it } from "vitest";
import { hiddenFromVisible, isAdjusted, storedArrangement, visibleSections } from "../arrangements";

const lyric = (id: string, section?: string) => ({ id, kind: "lyric", section });
const song = [lyric("v", "Verse"), lyric("c", "Chorus"), lyric("b", "Bridge")];

describe("isAdjusted (the arrangement button's faint / full state)", () => {
  it("a song as written is not adjusted", () => {
    expect(isAdjusted("song", song, undefined, [])).toBe(false);
    expect(
      isAdjusted("song", song, storedArrangement(["Verse#0", "Chorus#0", "Bridge#0"], song)),
    ).toBe(false);
  });
  it("a repeat, a reorder or a removal is adjusted", () => {
    const rep = storedArrangement(["Verse#0", "Chorus#0", "Chorus#0", "Bridge#0"], song);
    expect(isAdjusted("song", song, rep)).toBe(true);
    const cut = storedArrangement(["Verse#0", "Chorus#0"], song);
    expect(isAdjusted("song", song, cut)).toBe(true);
  });
  it("sections hidden with the old eye count for a song", () => {
    expect(isAdjusted("song", song, undefined, ["Bridge#0"])).toBe(true);
  });
  it("scripture: adjusted only when a current section is hidden", () => {
    expect(isAdjusted("scripture", song, undefined, [])).toBe(false);
    expect(isAdjusted("scripture", song, undefined, ["Gone#0"])).toBe(false);
    expect(isAdjusted("message", song, undefined, ["Chorus#0"])).toBe(true);
  });
  it("media never shows as adjusted", () => {
    expect(isAdjusted("media", song, undefined, ["Chorus#0"])).toBe(false);
  });
});

describe("scripture / message pills", () => {
  it("round-trip between visible pills and hidden keys", () => {
    const visible = visibleSections(song, ["Chorus#0"]);
    expect(visible).toEqual(["Verse#0", "Bridge#0"]);
    expect(hiddenFromVisible(song, visible)).toEqual(["Chorus#0"]);
    expect(hiddenFromVisible(song, ["Verse#0", "Chorus#0", "Bridge#0"])).toEqual([]);
  });
});
