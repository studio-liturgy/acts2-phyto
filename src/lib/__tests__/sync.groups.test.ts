import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { fakeSession, makeGathering, makeSet, USER_ID } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { fetchMyGroups, syncGroups } from "@/lib/sync";
import { useAuthStore } from "@/lib/authStore";
import { useLibrary } from "@/lib/store";
import { db } from "@/lib/db";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "00000000-0000-4000-8000-000000000099";

/** A claimed membership row as PostgREST returns it with the groups() embed. */
const membership = {
  id: "m1",
  user_id: USER_ID,
  group_id: GROUP_ID,
  role: "member",
  groups: { id: GROUP_ID, name: "Band", owner_id: OTHER_USER },
};

beforeEach(async () => {
  supabaseMock.configure({ session: fakeSession });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
  useLibrary.setState({ groups: [], activeWorkspace: "personal", activeWorkspaceName: "" });
  await resetDb();
});

async function seedGroupContent() {
  const foreignSet = makeSet({ shared: true, groupIds: [GROUP_ID], shared_by: "b@x.com" });
  const ownSet = makeSet({ groupIds: [GROUP_ID] });
  const foreignGathering = makeGathering({ shared: true, group_id: GROUP_ID });
  await db.sets.bulkPut([foreignSet, ownSet]);
  await db.gatherings.put(foreignGathering);
  return { foreignSet, ownSet, foreignGathering };
}

describe("fetchMyGroups", () => {
  it("returns null (unknown) on a fetch error, not an empty list", async () => {
    supabaseMock.configure({
      session: fakeSession,
      errors: [{ table: "group_members", op: "select", error: { message: "Failed to fetch" } }],
    });
    expect(await fetchMyGroups()).toBeNull();
  });
});

describe("syncGroups", () => {
  it("leaves local group content alone when the group list can't be fetched", async () => {
    const { foreignSet, ownSet, foreignGathering } = await seedGroupContent();
    supabaseMock.configure({
      session: fakeSession,
      errors: [{ table: "group_members", op: "select", error: { message: "Failed to fetch" } }],
    });

    await syncGroups();

    expect(await db.sets.get(foreignSet.id)).toBeDefined();
    expect((await db.sets.get(ownSet.id))?.groupIds).toEqual([GROUP_ID]);
    expect(await db.gatherings.get(foreignGathering.id)).toBeDefined();
  });

  it("still prunes group content once the server says I'm in no groups", async () => {
    const { foreignSet, ownSet, foreignGathering } = await seedGroupContent();
    supabaseMock.configure({ session: fakeSession, tables: { group_members: [] } });

    await syncGroups();

    expect(await db.sets.get(foreignSet.id)).toBeUndefined();
    expect((await db.sets.get(ownSet.id))?.groupIds).toEqual([]);
    expect(await db.gatherings.get(foreignGathering.id)).toBeUndefined();
  });

  it("keeps a group I'm still in", async () => {
    const { foreignSet } = await seedGroupContent();
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        group_members: [membership],
        group_sets: [
          {
            group_id: GROUP_ID,
            set_id: foreignSet.id,
            owner_id: OTHER_USER,
            owner_email: "b@x.com",
          },
        ],
        sets: [],
        gatherings: [],
        gathering_sets: [],
      },
    });

    await syncGroups();

    // Still granted, so my copy stays (content wasn't returned, so untouched).
    expect(await db.sets.get(foreignSet.id)).toBeDefined();
  });
});

describe("loadGroups", () => {
  it("keeps the current group list and workspace when the fetch fails", async () => {
    useLibrary.setState({
      groups: [{ id: GROUP_ID, name: "Band", role: "member", owner_id: OTHER_USER }],
      activeWorkspace: GROUP_ID,
      activeWorkspaceName: "Band",
    });
    supabaseMock.configure({
      session: fakeSession,
      errors: [{ table: "group_members", op: "select", error: { message: "Failed to fetch" } }],
    });

    await useLibrary.getState().loadGroups();

    expect(useLibrary.getState().groups).toHaveLength(1);
    expect(useLibrary.getState().activeWorkspace).toBe(GROUP_ID);
  });

  it("falls back to Personal once the server confirms I've left the group", async () => {
    useLibrary.setState({
      groups: [{ id: GROUP_ID, name: "Band", role: "member", owner_id: OTHER_USER }],
      activeWorkspace: GROUP_ID,
      activeWorkspaceName: "Band",
    });
    supabaseMock.configure({ session: fakeSession, tables: { group_members: [] } });

    await useLibrary.getState().loadGroups();

    expect(useLibrary.getState().groups).toHaveLength(0);
    expect(useLibrary.getState().activeWorkspace).toBe("personal");
  });
});
