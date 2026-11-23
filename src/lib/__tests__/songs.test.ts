import { afterEach, describe, expect, it, vi } from "vitest";
import { searchSongs } from "../songs";

const DB = [
  {
    title: "10,000 Reasons",
    artist: "Matt Redman",
    key: "G",
    lyrics: [
      "[Chorus]",
      "Bless the (C)Lord, O my (G)soul,",
      "(D/F#)O my (Em)soul,",
      "",
      "[Verse 1]",
      "The sun comes up (Intro)",
      "It's time to sing (x2)",
    ].join("\n"),
  },
  {
    title: "Amazing Grace",
    artist: "John Newton",
    lyrics: ["[Verse 1]", "Amazing grace how sweet the sound", "That saved a wretch like me"].join(
      "\n",
    ),
  },
  {
    title: "Holy, Holy, Holy",
    artist: "Heber, Reginald (1783-1826)",
    lyrics: [
      "[Verse 1]",
      "(D)Holy (Bm)holy (A)ho(D)ly (G)Lord God (D)Almighty",
      "(A)Early in the (Bm)morning our (E)song shall rise to (A)Thee",
    ].join("\n"),
  },
];

function mockDb(db: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("songs-en.json")) {
        return new Response(JSON.stringify(db), { status: 200 });
      }
      // lrclib — keep it empty so tests only exercise the local database.
      return new Response(JSON.stringify([]), { status: 200 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("searchSongs: chords survive the local database", () => {
  it("keeps inline chords in a local result's lyrics", async () => {
    mockDb(DB);
    const { local } = await searchSongs("10,000 Reasons");
    const hit = local.find((s) => s.title === "10,000 Reasons");
    expect(hit).toBeDefined();
    expect(hit!.lyrics).toContain("(C)Lord");
    expect(hit!.lyrics).toContain("(G)soul");
    expect(hit!.lyrics).toContain("(D/F#)O");
  });

  it("still strips genuine annotations, not just non-chords", async () => {
    mockDb(DB);
    const { local } = await searchSongs("10,000 Reasons");
    const hit = local.find((s) => s.title === "10,000 Reasons")!;
    expect(hit.lyrics).not.toContain("Intro");
    expect(hit.lyrics).not.toContain("x2");
  });

  it("passes the tagged key through on the result", async () => {
    mockDb(DB);
    const { local } = await searchSongs("10,000 Reasons");
    const hit = local.find((s) => s.title === "10,000 Reasons")!;
    expect(hit.key).toBe("G");
  });

  it("leaves a chordless song's key undefined", async () => {
    mockDb(DB);
    const { local } = await searchSongs("Amazing Grace");
    const hit = local.find((s) => s.title === "Amazing Grace")!;
    expect(hit.key).toBeUndefined();
  });
});

describe("searchSongs: punctuation and first lines", () => {
  it("finds a hymn by its first line, past chords and commas", async () => {
    mockDb(DB);
    const { local } = await searchSongs("Holy, Holy, Holy Lord God Almighty");
    expect(local[0]?.title).toBe("Holy, Holy, Holy");
  });

  it("ignores punctuation in titles", async () => {
    mockDb(DB);
    expect((await searchSongs("holy holy holy")).local[0]?.title).toBe("Holy, Holy, Holy");
  });

  it("still finds a remembered line in the middle", async () => {
    mockDb(DB);
    const { online } = await searchSongs("early in the morning");
    expect((await online).map((s) => s.title)).toContain("Holy, Holy, Holy");
  });
});
