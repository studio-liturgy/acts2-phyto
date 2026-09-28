import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeGathering, makeSet } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import {
  PHYTO_FILE_VERSION,
  buildPhytoFile,
  importCatalogue,
  migratePhytoFile,
} from "@/lib/catalogue-io";
import { db } from "@/lib/db";
import { useLibrary } from "@/lib/store";

// .phyto files move between builds of different ages (prod and test, watch, a
// tab left open), so they have to open in both directions.

const importJson = (file: unknown, mode: "merge" | "replace" = "replace") =>
  importCatalogue(new File([JSON.stringify(file)], "c.phyto"), mode);

beforeEach(async () => {
  await resetDb();
  useLibrary.setState({ groups: [] });
});

describe("older files still open", () => {
  it("reads a v1 file (sets only)", () => {
    const set = makeSet();
    const file = migratePhytoFile({ version: 1, exported_at: "2026-05-29", sets: [set] });
    expect(file.sets).toEqual([set]);
    expect(file.gatherings).toEqual([]);
  });

  it("reads a v2 file written before min_reader_version existed", () => {
    const set = makeSet();
    const gathering = makeGathering({ setIds: [set.id] });
    const file = migratePhytoFile({
      version: 2,
      exported_at: "2026-06-08",
      sets: [set],
      gatherings: [gathering],
    });
    expect(file.sets).toEqual([set]);
    expect(file.gatherings).toEqual([gathering]);
  });
});

describe("files from a newer build", () => {
  it("opens a newer version that says older readers can open it", () => {
    const set = makeSet();
    const file = migratePhytoFile({
      version: PHYTO_FILE_VERSION + 1,
      min_reader_version: PHYTO_FILE_VERSION,
      exported_at: "2027-01-01",
      sets: [set],
      gatherings: [],
      somethingNew: { a: 1 },
    });
    expect(file.sets).toEqual([set]);
  });

  it("refuses a newer version that needs a newer reader", () => {
    const newer = { exported_at: "2027-01-01", sets: [], gatherings: [] };
    expect(() => migratePhytoFile({ ...newer, version: PHYTO_FILE_VERSION + 1 })).toThrow(
      /newer version of phyto/,
    );
    expect(() =>
      migratePhytoFile({
        ...newer,
        version: PHYTO_FILE_VERSION,
        min_reader_version: PHYTO_FILE_VERSION + 1,
      }),
    ).toThrow(/newer version of phyto/);
  });

  it("keeps fields and kinds it doesn't know through an import", async () => {
    const set = {
      ...makeSet({ kind: "hymnal" as never }),
      futureSetField: { keep: true },
      slides: [{ id: "s1", kind: "countdown", seconds: 300 }],
    };
    const gathering = { ...makeGathering({ setIds: [set.id] }), futureGatheringField: "x" };
    await importJson({
      version: PHYTO_FILE_VERSION,
      exported_at: "2027-01-01",
      sets: [set],
      gatherings: [gathering],
    });

    const stored = (await db.sets.get(set.id)) as unknown as Record<string, unknown>;
    expect(stored.kind).toBe("hymnal");
    expect(stored.futureSetField).toEqual({ keep: true });
    expect(stored.slides).toEqual([{ id: "s1", kind: "countdown", seconds: 300 }]);
    const storedGathering = (await db.gatherings.get(gathering.id)) as unknown as Record<
      string,
      unknown
    >;
    expect(storedGathering.futureGatheringField).toBe("x");
  });
});

describe("what this build writes", () => {
  // The check every build before min_reader_version shipped with. A file written
  // today must pass it, or those builds can't open it. If a change really does
  // need a new version, older builds will refuse the file: make sure that's
  // what you want before changing this test.
  const olderBuildAccepts = (f: { version: unknown }) => f.version === 1 || f.version === 2;

  it("stays openable by builds from before min_reader_version", () => {
    const file = buildPhytoFile([makeSet()], [makeGathering()]);
    expect(olderBuildAccepts(file)).toBe(true);
    expect(file.min_reader_version).toBeLessThanOrEqual(file.version);
  });

  it("reads back what it writes, unchanged", () => {
    const set = makeSet({ chords: { key: "G", display: "numbers", hidden: true } });
    const gathering = makeGathering({ setIds: [set.id], live_started_at: 1700000000000 });
    const written = JSON.parse(JSON.stringify(buildPhytoFile([set], [gathering])));
    const read = migratePhytoFile(written);
    expect(read.sets).toEqual([set]);
    expect(read.gatherings).toEqual([gathering]);
  });
});

describe("malformed files", () => {
  it("rejects what isn't a .phyto file", () => {
    expect(() => migratePhytoFile(null)).toThrow(/not a JSON object/);
    expect(() => migratePhytoFile([])).toThrow(/not a JSON object/);
    expect(() => migratePhytoFile({ sets: [] })).toThrow(/missing "version"/);
    expect(() => migratePhytoFile({ version: "two" })).toThrow(/Unrecognised/);
    expect(() => migratePhytoFile({ version: 2, sets: {} })).toThrow(/"sets" is not a list/);
  });

  it("backfills what a set can't run without", () => {
    const [set] = migratePhytoFile({
      version: 2,
      sets: [{ slides: [{ kind: "lyric", lines: ["a"] }], createdAt: "2026-06-01T00:00:00Z" }],
    }).sets;
    expect(set.id).toEqual(expect.any(String));
    expect(set.name).toBe("");
    expect(set.kind).toBe("mixed");
    expect(set.slides[0].id).toEqual(expect.any(String));
    expect(set.slides[0].lines).toEqual(["a"]);
    // Timestamps must be valid dates: sync turns them into ISO strings.
    expect(set.createdAt).toBe(Date.parse("2026-06-01T00:00:00Z"));
    expect(set.updatedAt).toBe(set.createdAt);
  });

  it("backfills a gathering and drops set refs that aren't ids", () => {
    const [g] = migratePhytoFile({
      version: 2,
      sets: [],
      gatherings: [{ id: "g1", setIds: ["a", 7, null, "b"], is_live: "yes" }],
    }).gatherings;
    expect(g.setIds).toEqual(["a", "b"]);
    expect(g.share_token).toEqual(expect.any(String));
    expect(g.is_live).toBe(false);
    expect(g.live_started_at).toBeNull();
    expect(Number.isFinite(g.createdAt)).toBe(true);
  });

  it("keeps every slide, even one that repeats another's id", () => {
    const slides = [
      { id: "s1", kind: "lyric", lines: ["first"] },
      { id: "s1", kind: "lyric", lines: ["second"] },
    ];
    const [set] = migratePhytoFile({ version: 2, sets: [makeSet({ slides } as never)] }).sets;
    expect(set.slides.map((s) => s.lines?.[0])).toEqual(["first", "second"]);
  });

  it("drops non-object rows and keeps the last of a repeated id", () => {
    const first = makeSet({ id: "dup", name: "first" });
    const last = makeSet({ id: "dup", name: "last" });
    const { sets } = migratePhytoFile({ version: 2, sets: [first, "junk", null, last] });
    expect(sets).toEqual([last]);
  });

  it("leaves the library as it was when a replace fails part-way", async () => {
    const existing = makeSet({ name: "keep me" });
    await db.sets.add(existing);
    vi.spyOn(db.gatherings, "bulkPut").mockRejectedValueOnce(new Error("disk full"));

    await expect(
      importJson({ version: 2, sets: [makeSet()], gatherings: [makeGathering()] }),
    ).rejects.toThrow("disk full");

    expect(await db.sets.toArray()).toEqual([existing]);
  });
});
