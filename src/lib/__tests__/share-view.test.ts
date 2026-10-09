import { describe, it, expect } from "vitest";
import { parseShareView } from "../share-view";

const LIVE_AT = "2026-10-09T09:40:11.27+00:00";

describe("parseShareView", () => {
  it("is null for a token that matches nothing", () => {
    expect(parseShareView(null)).toBeNull();
    expect(parseShareView(undefined)).toBeNull();
  });

  it("resolves a real slug with nothing live to waiting", () => {
    expect(parseShareView({ kind: "waiting" })).toEqual({ kind: "waiting" });
  });

  it("parses a live gathering and keeps the server's set order", () => {
    const res = parseShareView({
      kind: "gathering",
      gathering: {
        title: "Sunday",
        is_live: true,
        live_started_at: LIVE_AT,
        hidden_sections: { s2: ["bridge"] },
      },
      sets: [
        {
          position: 0,
          id: "s2",
          title: "Song",
          type: "song",
          content: { slides: [{ kind: "lyrics" }] },
        },
        {
          position: 1,
          id: "s1",
          title: "Reading",
          type: "scripture",
          content: { slides: [], versions: ["NIV"] },
        },
      ],
    });
    expect(res).toEqual({
      kind: "gathering",
      gathering: {
        title: "Sunday",
        is_live: true,
        live_started_at: new Date(LIVE_AT).getTime(),
        hidden_sections: { s2: ["bridge"] },
      },
      sets: [
        { id: "s2", title: "Song", type: "song", content: { slides: [{ kind: "lyrics" }] } },
        {
          id: "s1",
          title: "Reading",
          type: "scripture",
          content: { slides: [], versions: ["NIV"] },
        },
      ],
    });
  });

  it("treats a missing live clock as null, so isLiveNow fails closed", () => {
    const res = parseShareView({
      kind: "gathering",
      gathering: { title: "Old", is_live: true, live_started_at: null, hidden_sections: {} },
      sets: [],
    });
    expect(res?.kind === "gathering" && res.gathering.live_started_at).toBeNull();
  });

  it("defaults missing hidden sections, sets and slides", () => {
    const res = parseShareView({
      kind: "gathering",
      gathering: { title: "T", is_live: false, live_started_at: null },
      sets: [{ id: "a", title: "A", type: "song", content: null }],
    });
    expect(res).toEqual({
      kind: "gathering",
      gathering: { title: "T", is_live: false, live_started_at: null, hidden_sections: {} },
      sets: [{ id: "a", title: "A", type: "song", content: { slides: [] } }],
    });
  });

  it("drops malformed set rows instead of throwing", () => {
    const res = parseShareView({
      kind: "gathering",
      gathering: { title: "T", is_live: true, live_started_at: LIVE_AT, hidden_sections: {} },
      sets: [null, "x", { title: "no id" }, { id: "ok", title: "Ok", type: "song", content: {} }],
    });
    expect(res?.kind === "gathering" && res.sets.map((s) => s.id)).toEqual(["ok"]);
  });

  it("is null for an unknown or malformed payload", () => {
    expect(parseShareView({ kind: "other" })).toBeNull();
    expect(parseShareView({ kind: "gathering" })).toBeNull();
    expect(parseShareView([])).toBeNull();
  });
});
