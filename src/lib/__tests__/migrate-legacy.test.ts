import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyLocalStorage } from "@/lib/migrate-legacy";
import { db } from "@/lib/db";
import { resetDb } from "@/test/db-utils";

const LEGACY_KEY = "stage-library-v1";
const MIGRATED_FLAG = "phyto-legacy-migrated-v1";

const legacyBlob = {
  state: {
    sets: {
      abc123: {
        id: "abc123",
        name: "Amazing Grace",
        kind: "song",
        slides: [{ id: "sl-1", kind: "lyric", lines: ["Amazing grace"] }],
        createdAt: 1690000000000,
        updatedAt: 1690000001000,
      },
      def456: {
        id: "def456",
        name: "Psalm 23",
        kind: "scripture",
        slides: [],
        createdAt: 1690000002000,
        updatedAt: 1690000003000,
      },
    },
    playlists: {
      pl1: {
        id: "pl1",
        name: "Sunday Service",
        // "ghost" never existed in sets — must be dropped, not carried as a dangling ref.
        setIds: ["abc123", "ghost", "def456"],
        createdAt: 1690000004000,
        updatedAt: 1690000005000,
      },
    },
    songTemplate: { fontScale: 1.2 },
  },
};

beforeEach(async () => {
  await resetDb();
});

describe("migrateLegacyLocalStorage", () => {
  it("re-IDs sets, remaps gathering setIds, and backfills new fields", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyBlob));

    const migrated = await migrateLegacyLocalStorage();
    expect(migrated).toBe(2);

    const sets = await db.sets.toArray();
    expect(sets).toHaveLength(2);
    // Every set got a fresh UUID (phase-0 ids were short base36).
    for (const s of sets) expect(s.id).toMatch(/^[0-9a-f-]{36}$/);

    const gatherings = await db.gatherings.toArray();
    expect(gatherings).toHaveLength(1);
    const g = gatherings[0];
    const byName = new Map(sets.map((s) => [s.name, s.id]));
    // Remapped in order, unresolvable "ghost" dropped.
    expect(g.setIds).toEqual([byName.get("Amazing Grace"), byName.get("Psalm 23")]);
    expect(g.share_token).toHaveLength(10);
    expect(g.is_live).toBe(false);

    // Song template carried over; legacy blob kept as a safety net.
    expect(localStorage.getItem("song-template-v1")).toBe(JSON.stringify({ fontScale: 1.2 }));
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it("no-ops after the first run (idempotency flag)", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyBlob));
    expect(await migrateLegacyLocalStorage()).toBe(2);
    expect(await migrateLegacyLocalStorage()).toBe(0);
    expect(await db.sets.count()).toBe(2);
  });

  it("sets the flag and returns 0 when there is nothing to migrate", async () => {
    expect(await migrateLegacyLocalStorage()).toBe(0);
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
  });

  it("swallows malformed JSON, flags, and never blocks boot", async () => {
    localStorage.setItem(LEGACY_KEY, "{not json!!");
    expect(await migrateLegacyLocalStorage()).toBe(0);
    expect(localStorage.getItem(MIGRATED_FLAG)).toBe("1");
    expect(await db.sets.count()).toBe(0);
  });

  it("reads an unwrapped payload (no zustand {state} envelope)", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyBlob.state));
    expect(await migrateLegacyLocalStorage()).toBe(2);
  });
});
