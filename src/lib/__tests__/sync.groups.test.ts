import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { fakeSession, makeGathering, makeSet, setRow, USER_ID } from "@/test/fixtures";
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
    const grant = {
      group_id: GROUP_ID,
      set_id: foreignSet.id,
      owner_id: OTHER_USER,
      owner_email: "b@x.com",
    };
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        group_members: [membership],
        group_sets: [grant],
        sets: [setRow(foreignSet, OTHER_USER)],
        gatherings: [],
        gathering_sets: [],
      },
    });

    await syncGroups();

    // Still granted and the row is there, so my copy stays (no newer content).
    expect(await db.sets.get(foreignSet.id)).toBeDefined();
  });

  it("drops a granted set whose row is gone (deleted by its owner)", async () => {
    // The grant should cascade away with the set; if it lingers, the set still
    // no longer exists, and a copy that stayed was the "ghost" in a member's
    // catalogue.
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

    expect(await db.sets.get(foreignSet.id)).toBeUndefined();
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

// ---------------------------------------------------------------------------
// Two-way collaboration on granted sets: other members' edits to a set I OWN
// reach me live (last-write-wins), and content is only downloaded for rows
// that are newer than my copy.
// ---------------------------------------------------------------------------

import { syncSharedSets } from "@/lib/sync";

const grant = (setId: string, ownerId: string) => ({
  group_id: GROUP_ID,
  set_id: setId,
  owner_id: ownerId,
  owner_email: ownerId === USER_ID ? "test@example.com" : "b@x.com",
});

describe("syncGroups: granted sets", () => {
  it("adopts a member's newer edit to a set I own, keeping my local tags", async () => {
    const mine = makeSet({ name: "Before", groupIds: [GROUP_ID], updatedAt: 1000 });
    await db.sets.put(mine);
    const edited = { ...mine, name: "After (edited by B)", updatedAt: 5000 };
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        group_members: [membership],
        group_sets: [grant(mine.id, USER_ID)],
        sets: [setRow(edited)],
        gatherings: [],
        gathering_sets: [],
      },
    });

    await syncGroups();

    const after = await db.sets.get(mine.id);
    expect(after?.name).toBe("After (edited by B)");
    expect(after?.updatedAt).toBe(5000);
    expect(after?.shared).toBeUndefined();
    expect(after?.groupIds).toEqual([GROUP_ID]);
  });

  it("keeps my own pending edit when it is newer than the server's copy", async () => {
    const mine = makeSet({ name: "My pending edit", groupIds: [GROUP_ID], updatedAt: 9000 });
    await db.sets.put(mine);
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        group_members: [membership],
        group_sets: [grant(mine.id, USER_ID)],
        sets: [setRow({ ...mine, name: "Older server copy", updatedAt: 5000 })],
        gatherings: [],
        gathering_sets: [],
      },
    });

    await syncGroups();

    expect((await db.sets.get(mine.id))?.name).toBe("My pending edit");
  });

  it("reads metadata only, and downloads content just for rows newer than mine", async () => {
    const unchanged = makeSet({ shared: true, groupIds: [GROUP_ID], updatedAt: 1000 });
    const changed = makeSet({ shared: true, groupIds: [GROUP_ID], updatedAt: 1000 });
    const fresh = makeSet({ updatedAt: 1000 }); // granted, not held locally yet
    await db.sets.bulkPut([unchanged, changed]);
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        group_members: [membership],
        group_sets: [
          grant(unchanged.id, OTHER_USER),
          grant(changed.id, OTHER_USER),
          grant(fresh.id, OTHER_USER),
        ],
        sets: [
          setRow(unchanged, OTHER_USER),
          setRow({ ...changed, name: "Changed remotely", updatedAt: 2000 }, OTHER_USER),
          setRow(fresh, OTHER_USER),
        ],
        gatherings: [],
        gathering_sets: [],
      },
    });

    await syncGroups();

    const reads = supabaseMock.callsFor("sets", "select");
    expect(reads.map((c) => c.columns)).toEqual(["id, updated_at", "*"]);
    const contentIds = reads[1].filters.find((f) => f.kind === "in")?.value as string[];
    expect([...contentIds].sort()).toEqual([changed.id, fresh.id].sort());

    expect((await db.sets.get(changed.id))?.name).toBe("Changed remotely");
    expect((await db.sets.get(fresh.id))?.shared).toBe(true);
    expect((await db.sets.get(fresh.id))?.groupIds).toEqual([GROUP_ID]);
    expect((await db.sets.get(unchanged.id))?.updatedAt).toBe(1000);
  });

  it("skips the content download entirely when nothing is newer", async () => {
    const foreign = makeSet({ shared: true, groupIds: [GROUP_ID], updatedAt: 1000 });
    await db.sets.put(foreign);
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        group_members: [membership],
        group_sets: [grant(foreign.id, OTHER_USER)],
        sets: [setRow(foreign, OTHER_USER)],
        gatherings: [],
        gathering_sets: [],
      },
    });

    await syncGroups();

    expect(supabaseMock.callsFor("sets", "select").map((c) => c.columns)).toEqual([
      "id, updated_at",
    ]);
  });
});

describe("syncSharedSets", () => {
  const shareRow = (setId: string, ownerId: string, granteeId: string) => ({
    id: `share-${setId}`,
    set_id: setId,
    owner_id: ownerId,
    owner_email: ownerId === USER_ID ? "test@example.com" : "b@x.com",
    grantee_email: granteeId === USER_ID ? "test@example.com" : "b@x.com",
    grantee_user_id: granteeId,
  });

  it("adopts a grantee's newer edit to a set I shared out", async () => {
    const mine = makeSet({ name: "Before", updatedAt: 1000 });
    await db.sets.put(mine);
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        set_shares: [shareRow(mine.id, USER_ID, OTHER_USER)],
        sets: [setRow({ ...mine, name: "Edited by grantee", updatedAt: 3000 })],
      },
    });

    await syncSharedSets();

    const after = await db.sets.get(mine.id);
    expect(after?.name).toBe("Edited by grantee");
    expect(after?.shared).toBeUndefined();
  });

  it("still adopts the owner's edit to a set shared with me, and prunes a revoked one", async () => {
    const saved = makeSet({ shared: true, shared_by: "b@x.com", updatedAt: 1000 });
    const revoked = makeSet({ shared: true, shared_by: "b@x.com", updatedAt: 1000 });
    await db.sets.bulkPut([saved, revoked]);
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        set_shares: [shareRow(saved.id, OTHER_USER, USER_ID)],
        sets: [setRow({ ...saved, name: "Owner's newer edit", updatedAt: 2000 }, OTHER_USER)],
      },
    });

    await syncSharedSets();

    expect((await db.sets.get(saved.id))?.name).toBe("Owner's newer edit");
    expect((await db.sets.get(saved.id))?.shared).toBe(true);
    expect(await db.sets.get(revoked.id)).toBeUndefined();
  });

  it("leaves everything alone when the metadata read fails", async () => {
    const saved = makeSet({ shared: true, updatedAt: 1000 });
    await db.sets.put(saved);
    supabaseMock.configure({
      session: fakeSession,
      tables: { set_shares: [shareRow(saved.id, OTHER_USER, USER_ID)], sets: [] },
      errors: [{ table: "sets", op: "select", error: { message: "Failed to fetch" } }],
    });

    await syncSharedSets();

    expect(await db.sets.get(saved.id)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// My own group gatherings sit outside the personal diff, so a deletion on one
// of my devices has to be propagated here via its tombstone.
// ---------------------------------------------------------------------------

import { tombstoneRow } from "@/test/fixtures";

describe("syncGroups: my own group gatherings", () => {
  const inGroup = () => ({
    group_members: [membership],
    group_sets: [],
    sets: [],
    gatherings: [],
    gathering_sets: [],
  });

  it("drops my copy of a group gathering I deleted on another device", async () => {
    const deleted = makeGathering({ group_id: GROUP_ID, updatedAt: 1000 });
    await db.gatherings.put(deleted);
    supabaseMock.configure({
      session: fakeSession,
      tables: { ...inGroup(), deletions: [tombstoneRow("gathering", deleted.id, 2000)] },
    });

    await syncGroups();

    expect(await db.gatherings.get(deleted.id)).toBeUndefined();
  });

  it("keeps a freshly created group gathering that hasn't been pushed yet", async () => {
    const fresh = makeGathering({ group_id: GROUP_ID, updatedAt: 1000 });
    await db.gatherings.put(fresh);
    supabaseMock.configure({ session: fakeSession, tables: { ...inGroup(), deletions: [] } });

    await syncGroups();

    expect(await db.gatherings.get(fresh.id)).toBeDefined();
  });

  it("keeps a copy edited after the tombstone (edit-over-delete wins, as in the personal diff)", async () => {
    const edited = makeGathering({ group_id: GROUP_ID, updatedAt: 3000 });
    await db.gatherings.put(edited);
    supabaseMock.configure({
      session: fakeSession,
      tables: { ...inGroup(), deletions: [tombstoneRow("gathering", edited.id, 2000)] },
    });

    await syncGroups();

    expect(await db.gatherings.get(edited.id)).toBeDefined();
  });
});
