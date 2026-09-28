import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { fakeSession, makeSet, setRow, USER_ID } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import {
  applyMerge,
  diffWithSupabase,
  fromSupabaseSet,
  pushToSupabase,
  setFingerprint,
  toSupabaseSet,
  toSupabaseSetShared,
} from "@/lib/sync";
import { useAuthStore } from "@/lib/authStore";
import { db } from "@/lib/db";
import type { Set as PhytoSet } from "@/lib/types";

// A set can carry fields this build doesn't know: from a newer build or watch,
// arriving by a .phyto import or a pull. They must sync through `content`, or
// they survive on this device only and every other device loses them.

/** A set with a field this build has never heard of. */
const withFutureField = (overrides: Partial<PhytoSet> = {}, value: unknown = { on: true }) =>
  ({ ...makeSet(overrides), futureField: value }) as PhytoSet;

const futureField = (s: PhytoSet) => (s as unknown as Record<string, unknown>).futureField;

beforeEach(async () => {
  supabaseMock.configure({ session: fakeSession });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
  await resetDb();
});

describe("set content", () => {
  it("carries a field it doesn't know through the row and back", () => {
    const set = withFutureField({ chords: { key: "G", display: "letters", hidden: false } });
    const row = toSupabaseSet(set, USER_ID, "device-1");
    expect(row.content.futureField).toEqual({ on: true });
    expect(fromSupabaseSet(row)).toEqual(set);
    expect(toSupabaseSetShared(set, "device-1").content.futureField).toEqual({ on: true });
  });

  it("keeps columns and local collaboration tags out of content", () => {
    const set = makeSet({
      group_id: "grp-1",
      groupIds: ["grp-1"],
      shared: true,
      shared_by: "owner@example.com",
    });
    const keys = Object.keys(toSupabaseSet(set, USER_ID, "device-1").content);
    for (const k of [
      "id",
      "name",
      "kind",
      "group_id",
      "createdAt",
      "updatedAt",
      "groupIds",
      "shared",
      "shared_by",
    ]) {
      expect(keys).not.toContain(k);
    }
    expect(keys).toContain("slides");
  });

  it("ignores column and tag keys written into a row's content", () => {
    const set = makeSet();
    const row = {
      ...setRow(set),
      content: {
        ...(setRow(set).content as Record<string, unknown>),
        id: "not-the-id",
        name: "not-the-title",
        shared: true,
        shared_by: "someone@example.com",
        groupIds: ["grp-x"],
        createdAt: 1,
      },
    };
    const back = fromSupabaseSet(row);
    expect(back.id).toBe(set.id);
    expect(back.name).toBe(set.name);
    expect(back.createdAt).toBe(set.createdAt);
    expect(back.shared).toBeUndefined();
    expect(back.shared_by).toBeUndefined();
    expect(back.groupIds).toBeUndefined();
  });

  it("reads a row whose content isn't an object as a set with no slides", () => {
    const row = { ...setRow(makeSet()), content: ["not", "an", "object"] };
    const back = fromSupabaseSet(row);
    expect(back.slides).toEqual([]);
    expect(Object.keys(back)).not.toContain("0");
  });

  it("leaves unknown fields out of the fingerprint", () => {
    const set = makeSet();
    expect(setFingerprint(withFutureField(set, 1))).toBe(setFingerprint(set));
  });
});

describe("unknown fields across devices", () => {
  it("reach another device through a push and a pull", async () => {
    const set = withFutureField();
    await db.sets.put(set);
    expect(await pushToSupabase()).toBe(true);

    // Another device: empty Dexie, same account.
    await resetDb();
    const diff = await diffWithSupabase();
    expect(diff!.onlyRemote.sets).toHaveLength(1);
    await applyMerge(diff!);

    const pulled = await db.sets.get(set.id);
    expect(futureField(pulled!)).toEqual({ on: true });
  });

  it("adopts a remote change to an unknown field without raising a conflict", async () => {
    const local = withFutureField({}, "old");
    await db.sets.put(local);
    const remote = { ...local, futureField: "new", updatedAt: local.updatedAt + 5000 };
    supabaseMock.configure({
      session: fakeSession,
      tables: { sets: [setRow(remote as PhytoSet)], gatherings: [], gathering_sets: [] },
    });

    const diff = await diffWithSupabase();
    expect(diff!.modified.sets).toEqual([]);
    expect(diff!.touched.sets.map((p) => p.local.id)).toEqual([local.id]);

    await applyMerge(diff!);
    expect(futureField((await db.sets.get(local.id))!)).toBe("new");
  });

  it("settles after a push: the next diff finds nothing to do", async () => {
    await db.sets.put(withFutureField());
    expect(await pushToSupabase()).toBe(true);

    const diff = await diffWithSupabase();
    expect(diff!.onlyLocal.sets).toEqual([]);
    expect(diff!.modified.sets).toEqual([]);
    expect(diff!.touched.sets).toEqual([]);
  });
});
