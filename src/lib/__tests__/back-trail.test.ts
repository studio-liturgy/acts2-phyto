import { describe, expect, it } from "vitest";
import { isStepBackPage, stepBackHref, withEntry } from "@/lib/back-trail";

describe("isStepBackPage", () => {
  it("counts the info pages and the Intro", () => {
    for (const p of [
      "/about",
      "/updates",
      "/terms",
      "/privacy",
      "/transparency",
      "/feedback",
      "/donate",
      "/?intro=true",
    ]) {
      expect(isStepBackPage(p)).toBe(true);
    }
  });

  it("leaves out home, the editor and sign in", () => {
    for (const p of ["/", "/?tab=settings", "/set/abc", "/present", "/login"]) {
      expect(isStepBackPage(p)).toBe(false);
    }
  });
});

describe("stepBackHref", () => {
  it("steps back to the info page one entry behind", () => {
    const trail = { "3": "/about", "4": "/transparency" };
    expect(stepBackHref(trail, 4, "/transparency")).toBe("/about");
  });

  it("steps back to the Intro", () => {
    expect(stepBackHref({ "0": "/?intro=true" }, 1, "/about")).toBe("/?intro=true");
  });

  it("goes home as before when the page behind is not an info page", () => {
    expect(stepBackHref({ "0": "/?tab=settings" }, 1, "/about")).toBeNull();
    expect(stepBackHref({ "0": "/login" }, 1, "/terms")).toBeNull();
  });

  it("goes home when nothing is behind (a fresh tab)", () => {
    expect(stepBackHref({ "0": "/about" }, 0, "/about")).toBeNull();
    expect(stepBackHref({}, 2, "/about")).toBeNull();
  });

  it("ignores the same page one entry behind", () => {
    expect(stepBackHref({ "1": "/donate" }, 2, "/donate")).toBeNull();
  });
});

describe("withEntry", () => {
  it("drops entries ahead of a new step (they were left behind)", () => {
    const trail = withEntry({ "0": "/", "1": "/about", "2": "/donate" }, 1, "/feedback");
    expect(trail).toEqual({ "0": "/", "1": "/feedback" });
  });

  it("keeps only the newest 50", () => {
    let trail = {};
    for (let i = 0; i < 60; i++) trail = withEntry(trail, i, `/p${i}`);
    expect(Object.keys(trail)).toHaveLength(50);
    expect(trail).not.toHaveProperty("9");
    expect(trail).toHaveProperty("10");
  });
});
