import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import {
  fakeSession,
  gatheringRow,
  gatheringSetRows,
  makeGathering,
  makeSet,
  setRow,
} from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { diffWithSupabase, hasDifferences, latestRemoteTime } from "@/lib/sync";
import { useAuthStore } from "@/lib/authStore";
import { db } from "@/lib/db";

beforeEach(async () => {
  supabaseMock.configure({ session: fakeSession });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
  await resetDb();
});

describe("diffWithSupabase", () => {
  it("returns null with no zustand session", async () => {
    useAuthStore.setState({ session: null });
    expect(await diffWithSupabase()).toBeNull();
  });

  it("returns null when zustand has a session but the supabase client does not (regression a243124)", async () => {
    // The zustand mirror can outlive the client's real session; querying anyway
    // would go out as anon and read a populated account as empty.
    supabaseMock.configure({ session: null });
    expect(await diffWithSupabase()).toBeNull();
    // And it must bail before ever querying tables.
    expect(supabaseMock.calls).toHaveLength(0);
  });

  it("returns null when the remote fetch fails, never treating failure as an empty account (regression a243124)", async () => {
    await db.sets.put(makeSet());
    supabaseMock.configure({
      session: fakeSession,
      errors: [{ table: "sets", op: "select", error: { message: "boom" } }],
    });
    expect(await diffWithSupabase()).toBeNull();
  });

  it("classifies a fresh device as localEmpty with the account in onlyRemote", async () => {
    const s = makeSet();
    const g = makeGathering();
    supabaseMock.configure({
      session: fakeSession,
      tables: { sets: [setRow(s)], gatherings: [gatheringRow(g)], gathering_sets: [] },
    });

    const diff = await diffWithSupabase();
    expect(diff).not.toBeNull();
    expect(diff!.localEmpty).toBe(true);
    expect(diff!.onlyRemote.sets.map((x) => x.id)).toEqual([s.id]);
    expect(diff!.onlyRemote.gatherings.map((x) => x.id)).toEqual([g.id]);
  });

  it("splits id-matched timestamp drift into touched (same content) vs modified (real conflict)", async () => {
    const touched = makeSet({ name: "Same Content" });
    const modified = makeSet({ name: "Conflict" });
    await db.sets.bulkPut([touched, modified]);

    supabaseMock.configure({
      session: fakeSession,
      tables: {
        sets: [
          // Timestamp drifted >1s, content identical → touched.
          setRow({ ...touched, updatedAt: touched.updatedAt + 5000 }),
          // Timestamp drifted AND renamed → modified.
          setRow({ ...modified, name: "Conflict (edited)", updatedAt: modified.updatedAt + 5000 }),
        ],
        gatherings: [],
        gathering_sets: [],
      },
    });

    const diff = await diffWithSupabase();
    expect(diff!.touched.sets.map((p) => p.local.id)).toEqual([touched.id]);
    expect(diff!.modified.sets.map((p) => p.local.id)).toEqual([modified.id]);
    expect(diff!.onlyLocal.sets).toEqual([]);
    expect(diff!.localEmpty).toBe(false);
  });

  it("adopts the account's set list when a gathering's timestamp matches but its slots differ (Oct 28: phone kept an empty October 26)", async () => {
    // Another device repointed the gathering's slots without moving its
    // timestamp. Comparing timestamps alone kept this device's stale list
    // forever; the account's list must win, silently.
    const s = makeSet();
    const stale = makeGathering({ setIds: [] });
    await db.sets.put(s);
    await db.gatherings.put(stale);
    const remote = { ...stale, setIds: [s.id] };
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        sets: [setRow(s)],
        gatherings: [gatheringRow(remote)],
        gathering_sets: gatheringSetRows(remote),
      },
    });

    const diff = await diffWithSupabase();
    expect(diff!.touched.gatherings.map((p) => p.remote.setIds)).toEqual([[s.id]]);
    expect(diff!.modified.gatherings).toEqual([]);
    expect(hasDifferences(diff!)).toBe(true);
    expect(latestRemoteTime(diff!)).toBeNull();
  });
});
