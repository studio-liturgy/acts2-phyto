import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import {
  gatheringRow,
  gatheringSetRows,
  makeGathering,
  makeSet,
  setRow,
  USER_ID,
} from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { fetchAllPages, fetchRemote } from "@/lib/sync";
import { db } from "@/lib/db";

beforeEach(async () => {
  supabaseMock.configure();
  await resetDb();
});

describe("fetchAllPages", () => {
  const page = (rows: number[], from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, to + 1).map((n) => ({ n })), error: null });

  it("walks pages until a short page and concatenates", async () => {
    const all = Array.from({ length: 503 }, (_, i) => i);
    const makeQuery = vi.fn((from: number, to: number) => page(all, from, to));
    const rows = await fetchAllPages(makeQuery, "test");
    expect(rows).toHaveLength(503);
    expect(makeQuery).toHaveBeenCalledTimes(2);
    expect(makeQuery).toHaveBeenNthCalledWith(1, 0, 499);
    expect(makeQuery).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it("fetches one extra empty page on an exact page boundary", async () => {
    const all = Array.from({ length: 500 }, (_, i) => i);
    const makeQuery = vi.fn((from: number, to: number) => page(all, from, to));
    const rows = await fetchAllPages(makeQuery, "test");
    expect(rows).toHaveLength(500);
    expect(makeQuery).toHaveBeenCalledTimes(2);
  });

  it("returns null on any page error — a failed fetch is not an empty result", async () => {
    const all = Array.from({ length: 700 }, (_, i) => i);
    const makeQuery = vi.fn((from: number, to: number) =>
      from === 0
        ? page(all, from, to)
        : Promise.resolve({ data: null, error: { message: "boom" } }),
    );
    expect(await fetchAllPages(makeQuery, "test")).toBeNull();
  });
});

describe("fetchRemote", () => {
  it("returns sets and gatherings with join rows resolved into ordered setIds", async () => {
    const s1 = makeSet({ name: "First" });
    const s2 = makeSet({ name: "Second" });
    const g = makeGathering({ setIds: [s1.id, s2.id] });
    supabaseMock.configure({
      tables: {
        sets: [setRow(s1), setRow(s2)],
        gatherings: [gatheringRow(g)],
        gathering_sets: gatheringSetRows(g),
      },
    });

    const remote = await fetchRemote(USER_ID);
    expect(remote).not.toBeNull();
    expect(remote!.sets.map((s) => s.name).sort()).toEqual(["First", "Second"]);
    expect(remote!.gatherings).toHaveLength(1);
    expect(remote!.gatherings[0].setIds).toEqual([s1.id, s2.id]);
  });

  it("orders setIds by position and drops duplicate positions deterministically", async () => {
    const s1 = makeSet();
    const s2 = makeSet();
    const g = makeGathering();
    supabaseMock.configure({
      tables: {
        sets: [setRow(s1), setRow(s2)],
        gatherings: [gatheringRow(g)],
        gathering_sets: [
          { id: "b", gathering_id: g.id, set_id: s2.id, position: 1 },
          { id: "a", gathering_id: g.id, set_id: s1.id, position: 0 },
          { id: "c", gathering_id: g.id, set_id: s1.id, position: 1 },
        ],
      },
    });
    const remote = await fetchRemote(USER_ID);
    // Sorted by position; the duplicate position 1 keeps the first-sorted row.
    expect(remote!.gatherings[0].setIds).toEqual([s1.id, s2.id]);
  });

  it("aborts (null) when OUR gathering's join rows reference a set missing from the fetch", async () => {
    // Models the anon-read failure: owner-only sets RLS silently returns zero
    // rows while the public gatherings policy still returns everything.
    const g = makeGathering();
    supabaseMock.configure({
      tables: {
        sets: [],
        gatherings: [gatheringRow(g)],
        gathering_sets: [{ id: "a", gathering_id: g.id, set_id: "missing-set", position: 0 }],
      },
    });
    expect(await fetchRemote(USER_ID)).toBeNull();
  });

  it("does NOT abort when a FOREIGN live gathering's join rows dangle", async () => {
    // The public-when-live policy leaks other users' join rows, which
    // legitimately reference sets we can never see.
    const mine = makeSet();
    supabaseMock.configure({
      tables: {
        sets: [setRow(mine)],
        gatherings: [],
        gathering_sets: [
          { id: "x", gathering_id: "someone-elses-gathering", set_id: "their-set", position: 0 },
        ],
      },
    });
    const remote = await fetchRemote(USER_ID);
    expect(remote).not.toBeNull();
    expect(remote!.sets).toHaveLength(1);
  });

  it("reuses local content for sets whose updated_at matches Dexie (metadata-first fetch)", async () => {
    const local = makeSet({ name: "Cached" });
    await db.sets.put(local);
    // Remote row carries DIFFERENT content under the same id + same timestamp;
    // the sync must trust Dexie and skip the content download.
    const remoteRow = setRow({ ...local, slides: [] });
    supabaseMock.configure({
      tables: { sets: [remoteRow], gatherings: [], gathering_sets: [] },
    });

    const remote = await fetchRemote(USER_ID);
    expect(remote!.sets[0].slides).toEqual(local.slides);
    // Only the metadata select ran against sets — no content fetch for known ids.
    const setSelects = supabaseMock.callsFor("sets", "select");
    expect(setSelects).toHaveLength(1);
  });
});
