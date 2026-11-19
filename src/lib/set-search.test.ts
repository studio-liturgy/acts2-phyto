import { describe, expect, it } from "vitest";
import { rankBySearch, searchRank, setMatchesSearch } from "./set-search";

const set = (name: string, ...lines: string[]) => ({ name, slides: [{ lines }] });

describe("set search", () => {
  const grace = set("Amazing Grace", "How sweet the sound");
  const oceans = set("Oceans", "Your (G)grace abounds in deepest waters");
  const graceAlone = set("Grace Alone", "Every promise we can make");
  const holy = set("Holy Forever", "A thousand generations");

  it("ranks the exact name, then names starting with it, then a word in the name, then the words", () => {
    expect(searchRank(set("Grace"), "grace")).toBe(0);
    expect(searchRank(graceAlone, "grace")).toBe(1);
    expect(searchRank(grace, "grace")).toBe(2);
    expect(searchRank(oceans, "grace")).toBe(3);
    expect(searchRank(holy, "grace")).toBe(-1);
  });

  it("doesn't count a search found inside a word of the name", () => {
    expect(searchRank(set("Christ Is Enough"), "no")).toBe(-1);
    expect(searchRank(set("Christ Is Enough", "I know"), "no")).toBe(3);
    expect(searchRank(set("God's Love"), "s")).toBe(-1);
  });

  it("matches anywhere in names written without spaces", () => {
    expect(searchRank(set("祢深知道我 (You Know Me)"), "知道")).toBe(2);
  });

  it("puts songs starting with the search first (the 'No' report)", () => {
    const list = [
      "Christ Is Enough",
      "Holy and Anointed One",
      "Love Note",
      "None But Jesus",
      "Nothing Else",
    ].map((n) => set(n, "no one else"));
    expect(rankBySearch(list, "no").map((d) => d.name)).toEqual([
      "None But Jesus",
      "Nothing Else",
      "Love Note",
      "Christ Is Enough",
      "Holy and Anointed One",
    ]);
  });

  it("ignores chords inside words", () => {
    expect(setMatchesSearch(oceans, "your grace")).toBe(true);
  });

  it("puts name matches first, keeping each group's order", () => {
    const sameGroup = rankBySearch([set("Grace Two"), set("Grace One")], "grace");
    expect(sameGroup.map((d) => d.name)).toEqual(["Grace Two", "Grace One"]);
    const out = rankBySearch([oceans, holy, grace, graceAlone], "grace");
    expect(out.map((d) => d.name)).toEqual(["Grace Alone", "Amazing Grace", "Oceans"]);
  });

  it("leaves the list alone with no search", () => {
    const list = [oceans, holy];
    expect(rankBySearch(list, "")).toBe(list);
  });
});
