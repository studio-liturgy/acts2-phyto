import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { emptyDiff, fakeSession, makeGathering, makeSet } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { applyMerge, deterministicUuid, pushToSupabase, writeGatheringSetRows } from "@/lib/sync";
import { useAuthStore } from "@/lib/authStore";
import { db } from "@/lib/db";
import { resolveSetRekey } from "@/lib/set-rekey";

beforeEach(async () => {
  supabaseMock.configure({ session: fakeSession });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
  await resetDb();
});

describe("writeGatheringSetRows (regression b77adf3)", () => {
  it("upserts join rows with ids deterministic from (gathering_id, position)", async () => {
    const g = makeGathering({ setIds: ["set-a", "set-b"] });
    expect(await writeGatheringSetRows(g)).toBe(true);

    const [upsert] = supabaseMock.callsFor("gathering_sets", "upsert");
    expect(upsert.rows).toEqual([
      {
        id: await deterministicUuid(g.id, "0"),
        gathering_id: g.id,
        set_id: "set-a",
        position: 0,
      },
      {
        id: await deterministicUuid(g.id, "1"),
        gathering_id: g.id,
        set_id: "set-b",
        position: 1,
      },
    ]);
  });

  it("is idempotent: repeating the write leaves exactly one row per position", async () => {
    const g = makeGathering({ setIds: ["set-a", "set-b"] });
    await writeGatheringSetRows(g);
    await writeGatheringSetRows(g);
    expect(supabaseMock.tables["gathering_sets"]).toHaveLength(2);
  });

  it("trims now-removed tail positions after the in-place upsert", async () => {
    const g = makeGathering({ setIds: ["set-a", "set-b", "set-c"] });
    await writeGatheringSetRows(g);
    expect(supabaseMock.tables["gathering_sets"]).toHaveLength(3);

    await writeGatheringSetRows({ ...g, setIds: ["set-c"] });
    const rows = supabaseMock.tables["gathering_sets"];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ gathering_id: g.id, set_id: "set-c", position: 0 });
  });
});

describe("applyMerge Step-6 heal (regression b77adf3)", () => {
  it("rewrites join rows of an id-matched gathering that references a just-pushed set", async () => {
    // History: the gathering landed remotely but its sets upsert failed, so its
    // gathering_sets rows were rejected by the FK and never retried. The
    // gathering is id-matched with equal timestamps, so no diff bucket revisits
    // it — only the heal pass can relink it once the sets finally land.
    const set = makeSet();
    const gathering = makeGathering({ setIds: [set.id] });
    await db.sets.put(set);
    await db.gatherings.put(gathering);

    await applyMerge(emptyDiff({ onlyLocal: { sets: [set], gatherings: [] } }));

    const joinUpserts = supabaseMock.callsFor("gathering_sets", "upsert");
    expect(joinUpserts).toHaveLength(1);
    expect(joinUpserts[0].rows).toMatchObject([
      { gathering_id: gathering.id, set_id: set.id, position: 0 },
    ]);
  });

  it("does not heal gatherings that reference no just-pushed set", async () => {
    const set = makeSet();
    const unrelated = makeGathering({ setIds: ["some-old-remote-set"] });
    await db.sets.put(set);
    await db.gatherings.put(unrelated);

    await applyMerge(emptyDiff({ onlyLocal: { sets: [set], gatherings: [] } }));

    expect(supabaseMock.callsFor("gathering_sets", "upsert")).toHaveLength(0);
  });
});

describe("42501 re-ID guard (regression 54618ca)", () => {
  it("applyMerge re-IDs a gathering owned by another account and re-upserts it", async () => {
    const g = makeGathering({ setIds: [] });
    await db.gatherings.put(g);

    supabaseMock.configure({
      session: fakeSession,
      errors: [
        // Batch upsert fails → per-row retry; the row fails RLS 42501 once →
        // re-ID; the re-upsert succeeds.
        { table: "gatherings", op: "upsert", error: { message: "batch failed" } },
        { table: "gatherings", op: "upsert", error: { code: "42501", message: "RLS" } },
      ],
    });

    await applyMerge(emptyDiff({ onlyLocal: { sets: [], gatherings: [g] } }));

    const local = await db.gatherings.toArray();
    expect(local).toHaveLength(1);
    expect(local[0].id).not.toBe(g.id);
    expect(local[0].share_token).not.toBe(g.share_token);
    expect(local[0].name).toBe(g.name);
    // The re-IDed row is what landed remotely.
    expect(supabaseMock.tables["gatherings"]).toMatchObject([{ id: local[0].id }]);
  });

  it("pushToSupabase re-IDs on 42501 and still reports success", async () => {
    const g = makeGathering({ setIds: [] });
    await db.gatherings.put(g);

    supabaseMock.configure({
      session: fakeSession,
      errors: [
        { table: "gatherings", op: "upsert", error: { message: "batch failed" } },
        { table: "gatherings", op: "upsert", error: { code: "42501", message: "RLS" } },
      ],
    });

    expect(await pushToSupabase()).toBe(true);

    const local = await db.gatherings.toArray();
    expect(local).toHaveLength(1);
    expect(local[0].id).not.toBe(g.id);
    expect(local[0].share_token).not.toBe(g.share_token);
    expect(supabaseMock.tables["gatherings"]).toMatchObject([{ id: local[0].id }]);
  });

  it("pushToSupabase keeps an owned set whose id another account owns as this account's copy", async () => {
    // Replays the Oct 19 flood: editing a set whose id exists remotely under a
    // row this account can't update. Every upsert hit RLS 42501 (USING), the
    // push returned false and store.ts re-queued it every 500 ms, forever.
    const set = makeSet();
    const gathering = makeGathering({ setIds: ["other-set", set.id] });
    await db.sets.put(set);
    await db.gatherings.put(gathering);

    supabaseMock.configure({
      session: fakeSession,
      errors: [{ table: "sets", op: "upsert", error: { code: "42501", message: "RLS" }, times: 2 }],
    });

    expect(await pushToSupabase({ setIds: [set.id], gatheringIds: [] })).toBe(true);

    // The local set now lives under a fresh id with the same content.
    expect(await db.sets.get(set.id)).toBeUndefined();
    const local = await db.sets.toArray();
    expect(local).toHaveLength(1);
    expect(local[0].id).not.toBe(set.id);
    expect(local[0].name).toBe(set.name);
    expect(local[0].slides).toEqual(set.slides);
    expect(resolveSetRekey(set.id)).toBe(local[0].id);

    // The copy is what landed remotely, owned by this account.
    expect(supabaseMock.tables["sets"]).toMatchObject([
      { id: local[0].id, user_id: fakeSession.user.id },
    ]);

    // The gathering that listed it now points at the copy, locally and remotely.
    expect((await db.gatherings.get(gathering.id))?.setIds).toEqual(["other-set", local[0].id]);
    const joinRows = supabaseMock.tables["gathering_sets"] ?? [];
    expect(joinRows.map((r) => r.set_id)).toContain(local[0].id);
    expect(joinRows.map((r) => r.set_id)).not.toContain(set.id);

    // A second push of the old id is a no-op, not another doomed upsert.
    const before = supabaseMock.callsFor("sets", "upsert").length;
    expect(await pushToSupabase({ setIds: [set.id], gatheringIds: [] })).toBe(true);
    expect(supabaseMock.callsFor("sets", "upsert")).toHaveLength(before);
  });

  it("pushToSupabase drops a stranded duplicate on 23505 instead of retrying forever", async () => {
    const keeper = makeGathering();
    const stranded = makeGathering();
    await db.gatherings.bulkPut([keeper, stranded]);

    // Incremental push of just the stranded row: the batch upsert fails, the
    // per-row retry hits the share_token unique violation.
    supabaseMock.configure({
      session: fakeSession,
      errors: [
        { table: "gatherings", op: "upsert", error: { message: "batch failed" } },
        { table: "gatherings", op: "upsert", error: { code: "23505", message: "dup" } },
      ],
    });
    expect(await pushToSupabase({ setIds: [], gatheringIds: [stranded.id] })).toBe(true);

    // The colliding local copy is deleted; unrelated rows are untouched.
    expect(await db.gatherings.get(stranded.id)).toBeUndefined();
    expect(await db.gatherings.get(keeper.id)).toBeDefined();
  });
});
