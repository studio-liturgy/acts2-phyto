import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "@/test/db-utils";
import { importCatalogue, migratePhytoFile } from "../catalogue-io";
import type { Set as PhytoSet } from "../types";

// Chord config lives on the Set alongside `template`, so it rides through the
// .phyto file for free — but "for free" is exactly the kind of assumption that
// silently breaks. Losing it would strand a song's chords: the bracket text
// survives inside slides, but key/display/hidden would be gone, so chords would
// vanish from the phone view until manually re-enabled.
const chordedSet: PhytoSet = {
  id: "set-chords",
  name: "10,000 Reasons",
  kind: "song",
  slides: [{ id: "s1", kind: "lyric", lines: ["Bless the (C)Lord, O my (G)soul,"] }],
  chords: { key: "G", display: "numbers", hidden: true },
  createdAt: 1,
  updatedAt: 2,
};

beforeEach(async () => {
  await resetDb();
});

describe("catalogue .phyto round-trip carries chord config", () => {
  it("survives export → import unchanged", async () => {
    await db.sets.bulkAdd([chordedSet]);

    // exportCatalogue() drives a DOM download; the payload it builds is the
    // part under test, so build it the same way and feed it back through import.
    const payload = {
      version: 2,
      exported_at: new Date().toISOString(),
      sets: await db.sets.toArray(),
      gatherings: await db.gatherings.toArray(),
    };
    const json = JSON.stringify(payload, null, 2);

    await resetDb();
    vi.spyOn(File.prototype, "text").mockResolvedValue(json);
    await importCatalogue(new File([json], "c.phyto"), "replace");

    const restored = await db.sets.get("set-chords");
    expect(restored?.chords).toEqual({ key: "G", display: "numbers", hidden: true });
    expect(restored?.slides[0].lines?.[0]).toBe("Bless the (C)Lord, O my (G)soul,");
  });

  it("leaves a v1 file's chordless sets undefined rather than inventing config", () => {
    const v1 = migratePhytoFile({
      version: 1,
      exported_at: "2020-01-01",
      sets: [{ ...chordedSet, chords: undefined }],
    });
    expect(v1.sets[0].chords).toBeUndefined();
  });
});
