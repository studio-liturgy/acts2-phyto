import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import {
  emptyDiff,
  fakeSession,
  gatheringRow,
  makeGathering,
  makeSet,
  setRow,
  tombstoneRow,
  USER_ID,
} from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import {
  applyMerge,
  diffWithSupabase,
  hasDifferences,
  latestRemoteTime,
  mergeFromSupabase,
  pushMirrorToSupabase,
  recordDeletions,
} from "@/lib/sync";
import { useAuthStore } from "@/lib/authStore";
import { db } from "@/lib/db";

beforeEach(async () => {
  supabaseMock.configure({ session: fakeSession });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
  await resetDb();
});

// The resurrection bug: device B deletes a set (Supabase row + local), device A
// still holds a copy. Without tombstones A's next diff classifies the copy as
// onlyLocal and silently pushes it back to the account. With tombstones the
// copy classifies as remotelyDeleted and is removed locally instead.
describe("diffWithSupabase tombstone classification", () => {
  it("classifies a tombstoned local set as remotelyDeleted, not onlyLocal", async () => {
    const s = makeSet();
    await db.sets.put(s);
    supabaseMock.configure({
      session: fakeSession,
      tables: { sets: [], gatherings: [], deletions: [tombstoneRow("set", s.id)] },
    });

    const diff = await diffWithSupabase();
    expect(diff!.remotelyDeleted.sets.map((x) => x.id)).toEqual([s.id]);
    expect(diff!.onlyLocal.sets).toEqual([]);
  });

  it("classifies a tombstoned local gathering as remotelyDeleted", async () => {
    const g = makeGathering();
    await db.gatherings.put(g);
    supabaseMock.configure({
      session: fakeSession,
      tables: { sets: [], gatherings: [], deletions: [tombstoneRow("gathering", g.id)] },
    });

    const diff = await diffWithSupabase();
    expect(diff!.remotelyDeleted.gatherings.map((x) => x.id)).toEqual([g.id]);
    expect(diff!.onlyLocal.gatherings).toEqual([]);
  });

  it("lets a local edit NEWER than the tombstone win (stays onlyLocal, re-pushed)", async () => {
    const s = makeSet({ updatedAt: 1700000005000 });
    await db.sets.put(s);
    supabaseMock.configure({
      session: fakeSession,
      // Deleted at :01, edited locally at :05 → the edit wins.
      tables: { sets: [], gatherings: [], deletions: [tombstoneRow("set", s.id, 1700000001000)] },
    });

    const diff = await diffWithSupabase();
    expect(diff!.onlyLocal.sets.map((x) => x.id)).toEqual([s.id]);
    expect(diff!.remotelyDeleted.sets).toEqual([]);
  });

  it("ignores a tombstone whose id is still present remotely (resurrected item)", async () => {
    const s = makeSet();
    await db.sets.put(s);
    supabaseMock.configure({
      session: fakeSession,
      // Row exists remotely again (e.g. conflict-dialog Push): the stale
      // tombstone must not delete anything — the item is simply id-matched.
      tables: { sets: [setRow(s)], gatherings: [], deletions: [tombstoneRow("set", s.id)] },
    });

    const diff = await diffWithSupabase();
    expect(diff!.remotelyDeleted.sets).toEqual([]);
    expect(hasDifferences(diff!)).toBe(false);
  });

  it("a deletion-only diff auto-applies silently (latestRemoteTime null)", async () => {
    const s = makeSet();
    await db.sets.put(s);
    supabaseMock.configure({
      session: fakeSession,
      tables: { sets: [], gatherings: [], deletions: [tombstoneRow("set", s.id)] },
    });

    const diff = await diffWithSupabase();
    expect(hasDifferences(diff!)).toBe(true);
    expect(latestRemoteTime(diff!)).toBeNull();
  });
});

describe("graceful degradation without the deletions table", () => {
  it("treats a missing table (PGRST205) as no tombstones instead of aborting", async () => {
    const s = makeSet();
    await db.sets.put(s);
    supabaseMock.configure({
      session: fakeSession,
      errors: [{ table: "deletions", op: "select", error: { code: "PGRST205" } }],
    });

    const diff = await diffWithSupabase();
    expect(diff).not.toBeNull();
    // Old (resurrect-prone) classification — but sync keeps working.
    expect(diff!.onlyLocal.sets.map((x) => x.id)).toEqual([s.id]);
  });

  it("aborts the pass on any OTHER deletions fetch error — a failed tombstone read is not an empty one", async () => {
    await db.sets.put(makeSet());
    supabaseMock.configure({
      session: fakeSession,
      errors: [{ table: "deletions", op: "select", error: { message: "boom" } }],
    });
    expect(await diffWithSupabase()).toBeNull();
  });
});

describe("mergeFromSupabase deletion propagation (the resurrection bug)", () => {
  it("deletes tombstoned items locally and never pushes them back", async () => {
    const s = makeSet();
    const g = makeGathering();
    await db.sets.put(s);
    await db.gatherings.put(g);
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        sets: [],
        gatherings: [],
        deletions: [tombstoneRow("set", s.id), tombstoneRow("gathering", g.id)],
      },
    });

    await mergeFromSupabase();

    expect(await db.sets.toArray()).toEqual([]);
    expect(await db.gatherings.toArray()).toEqual([]);
    expect(supabaseMock.callsFor("sets", "upsert")).toEqual([]);
    expect(supabaseMock.callsFor("gatherings", "upsert")).toEqual([]);
  });

  it("strips a remotely-deleted set from a pushed only-local gathering's setIds", async () => {
    const deleted = makeSet({ name: "Deleted On B" });
    const kept = makeSet({ name: "Still Mine" });
    const g = makeGathering({ setIds: [deleted.id, kept.id] });
    await db.sets.bulkPut([deleted, kept]);
    await db.gatherings.put(g);
    supabaseMock.configure({
      session: fakeSession,
      tables: { sets: [], gatherings: [], deletions: [tombstoneRow("set", deleted.id)] },
    });

    await mergeFromSupabase();

    // The kept set and the gathering were pushed; the deleted set was not, and
    // the gathering's join rows only reference the surviving set.
    expect(supabaseMock.tables["sets"].map((r) => r.id)).toEqual([kept.id]);
    expect(supabaseMock.tables["gathering_sets"]).toMatchObject([
      { gathering_id: g.id, set_id: kept.id, position: 0 },
    ]);
    expect((await db.gatherings.get(g.id))!.setIds).toEqual([kept.id]);
  });
});

describe("tombstone writes", () => {
  it("recordDeletions upserts one tombstone per id, keyed by the item's own uuid", async () => {
    await recordDeletions("set", ["id-1", "id-2"]);
    await recordDeletions("set", ["id-2"]); // re-delete refreshes, never duplicates

    expect(supabaseMock.tables["deletions"]).toHaveLength(2);
    expect(supabaseMock.tables["deletions"]).toMatchObject([
      { id: "id-1", user_id: USER_ID, kind: "set" },
      { id: "id-2", user_id: USER_ID, kind: "set" },
    ]);
  });

  it("pushMirrorToSupabase tombstones the remote-only rows it deletes", async () => {
    const remoteOnlySet = makeSet();
    const remoteOnlyGathering = makeGathering();
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        sets: [setRow(remoteOnlySet)],
        gatherings: [gatheringRow(remoteOnlyGathering)],
      },
    });

    await pushMirrorToSupabase(
      emptyDiff({
        onlyRemote: { sets: [remoteOnlySet], gatherings: [remoteOnlyGathering] },
      }),
    );

    expect(supabaseMock.tables["sets"]).toEqual([]);
    expect(supabaseMock.tables["gatherings"]).toEqual([]);
    expect(supabaseMock.tables["deletions"]).toMatchObject([
      { id: remoteOnlyGathering.id, kind: "gathering" },
      { id: remoteOnlySet.id, kind: "set" },
    ]);
  });

  it("applyMerge under localPolicy drop (Replace) still removes tombstoned items locally", async () => {
    const s = makeSet();
    await db.sets.put(s);

    await applyMerge(emptyDiff({ remotelyDeleted: { sets: [s], gatherings: [] } }), {
      localPolicy: "drop",
    });

    expect(await db.sets.toArray()).toEqual([]);
  });
});

describe("store delete paths write tombstones", () => {
  it("deleteSets records set tombstones alongside the Supabase delete", async () => {
    // store.ts has module side effects (BroadcastChannel, liveQuery); make sure
    // jsdom has a BroadcastChannel before importing it.
    if (typeof globalThis.BroadcastChannel === "undefined") {
      class FakeBC {
        onmessage: unknown = null;
        postMessage() {}
        addEventListener() {}
        removeEventListener() {}
        close() {}
      }
      globalThis.BroadcastChannel = FakeBC as unknown as typeof BroadcastChannel;
    }
    const { useLibrary } = await import("@/lib/store");

    const s = makeSet();
    await db.sets.put(s);
    supabaseMock.configure({
      session: fakeSession,
      tables: { sets: [setRow(s)], gatherings: [], gathering_sets: [] },
    });
    await useLibrary.getState().loadFromDb();

    await useLibrary.getState().deleteSets([s.id]);

    expect(supabaseMock.tables["sets"]).toEqual([]);
    expect(supabaseMock.tables["deletions"]).toMatchObject([{ id: s.id, kind: "set" }]);
    expect(await db.sets.toArray()).toEqual([]);
  });
});
