import { describe, expect, it } from "vitest";
import {
  PartsBuffer,
  contentHash,
  parseMessage,
  reconnectDelay,
  roomPath,
  screenLinkUrl,
  splitSet,
} from "../remote-protocol";
import { centredIndex, gatheringRun, runIndex, stepRun } from "../remote-run";
import type { Set as PhytoSet, Slide } from "../types";

const lyric = (id: string, section?: string): Slide => ({ id, kind: "lyric", section });
const song = (id: string, slides: Slide[]): PhytoSet => ({
  id,
  name: id,
  kind: "song",
  slides,
  createdAt: 0,
  updatedAt: 0,
});

describe("set parts", () => {
  const big: PhytoSet = {
    ...song("s1", [lyric("a", "Verse")]),
    slides: [{ id: "img", kind: "image", imageUrl: "data:image/png;base64," + "x".repeat(1000) }],
  };

  it("a set splits into parts and comes back whole", () => {
    const parts = splitSet(big, 300);
    expect(parts.length).toBeGreaterThan(3);
    expect(new Set(parts.map((p) => p.v)).size).toBe(1);
    const buf = new PartsBuffer();
    const out = parts.map((p) => buf.add(p));
    expect(out.slice(0, -1).every((o) => o === null)).toBe(true);
    expect(out[out.length - 1]).toEqual(big);
  });

  it("a small set is one part", () => {
    expect(splitSet(song("s", [lyric("a")])).length).toBe(1);
  });

  it("parts of a newer version replace an unfinished older one", () => {
    const old = splitSet(big, 300);
    const changed = { ...big, name: "renamed" };
    const fresh = splitSet(changed, 300);
    expect(fresh[0].v).not.toBe(old[0].v);
    const buf = new PartsBuffer();
    buf.add(old[0]);
    buf.add(old[1]);
    let got: PhytoSet | null = null;
    for (const p of fresh) got = buf.add(p) ?? got;
    expect(got).toEqual(changed);
  });

  it("a mid-set part with no start is ignored", () => {
    const parts = splitSet(big, 300);
    const buf = new PartsBuffer();
    expect(buf.add(parts[2])).toBeNull();
    let got: PhytoSet | null = null;
    for (const p of parts) got = buf.add(p) ?? got;
    expect(got).toEqual(big);
  });

  it("the same part twice doesn't finish a set early", () => {
    const parts = splitSet(big, 300);
    const buf = new PartsBuffer();
    buf.add(parts[0]);
    expect(buf.add(parts[0])).toBeNull();
  });

  it("the hash changes with the content", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
  });
});

describe("messages and links", () => {
  it("parses JSON objects with a type only", () => {
    expect(parseMessage('{"t":"reset"}')).toEqual({ t: "reset" });
    expect(parseMessage("pong")).toBeNull();
    expect(parseMessage('{"x":1}')).toBeNull();
    expect(parseMessage(new ArrayBuffer(2))).toBeNull();
  });
  it("builds the room path and the screen link", () => {
    expect(roomPath("my-church", "remote")).toBe("/screen-room/my-church?role=remote");
    expect(screenLinkUrl("https://phytoexp.live", "my-church")).toBe(
      "https://phytoexp.live/screen/my-church",
    );
  });
  it("backs off to 10 seconds", () => {
    expect([0, 1, 2, 3, 4, 9].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  });
});

describe("gathering run", () => {
  const sets = {
    s1: song("s1", [lyric("v", "Verse"), lyric("c", "Chorus")]),
    s2: song("s2", [lyric("x")]),
  };

  it("plays each set in its arrangement, sets one after another", () => {
    const run = gatheringRun(["s1", "missing", "s2"], sets, {
      s1: ["Verse#0", "Chorus#0", "Chorus#0"],
    });
    expect(run.map((p) => `${p.setId}:${p.slideId}:${p.occ}`)).toEqual([
      "s1:v:0",
      "s1:c:0",
      "s1:c:1",
      "s2:x:0",
    ]);
    expect(run[3].slot).toBe(2);
  });

  it("leaves out hidden sections", () => {
    const run = gatheringRun(["s1"], sets, {}, { s1: ["Verse#0"] });
    expect(run.map((p) => p.slideId)).toEqual(["c"]);
  });

  it("finds the live slide, repeats included", () => {
    const run = gatheringRun(["s1", "s2"], sets, { s1: ["Verse#0", "Chorus#0", "Chorus#0"] });
    expect(runIndex(run, { setId: "s1", slideId: "c", slideOcc: 1 })).toBe(2);
    expect(runIndex(run, { setId: "s1", slideId: "c", slideOcc: 5 })).toBe(1);
    expect(runIndex(run, { setId: null, slideId: null })).toBe(-1);
  });

  it("steps across sets and stops at the ends", () => {
    const run = gatheringRun(["s1", "s2"], sets);
    expect(stepRun(run, -1, 1)).toEqual(run[0]);
    expect(stepRun(run, -1, -1)).toBeNull();
    expect(stepRun(run, 1, 1)?.setId).toBe("s2");
    expect(stepRun(run, 2, 1)).toBeNull();
    expect(stepRun(run, 0, -1)).toBeNull();
  });

  it("picks the item nearest the scroller's middle", () => {
    const items = [0, 1, 2, 3].map((i) => ({ left: i * 100, width: 100 }));
    expect(centredIndex(items, 0, 100)).toBe(0);
    expect(centredIndex(items, 160, 100)).toBe(2);
    expect(centredIndex([], 0, 100)).toBe(-1);
  });
});
