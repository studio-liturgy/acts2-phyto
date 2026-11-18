import { describe, expect, it } from "vitest";
import { rankBySearch, searchRank, setMatchesSearch } from "./set-search";

const set = (name: string, ...lines: string[]) => ({ name, slides: [{ lines }] });

describe("set search", () => {
  const grace = set("Amazing Grace", "How sweet the sound");
  const oceans = set("Oceans", "Your (G)grace abounds in deepest waters");
  const graceAlone = set("Grace Alone", "Every promise we can make");
  const holy = set("Holy Forever", "A thousand generations");

  it("ranks name matches above word matches", () => {
    expect(searchRank(grace, "grace")).toBe(0);
    expect(searchRank(oceans, "grace")).toBe(1);
    expect(searchRank(holy, "grace")).toBe(-1);
  });

  it("ignores chords inside words", () => {
    expect(setMatchesSearch(oceans, "your grace")).toBe(true);
  });

  it("puts name matches first, keeping each group's order", () => {
    const out = rankBySearch([oceans, holy, grace, graceAlone], "grace");
    expect(out.map((d) => d.name)).toEqual(["Amazing Grace", "Grace Alone", "Oceans"]);
  });

  it("leaves the list alone with no search", () => {
    const list = [oceans, holy];
    expect(rankBySearch(list, "")).toBe(list);
  });
});
