import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { emptyDiff, fakeSession, makeGathering, makeSet } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { applyMerge } from "@/lib/sync";
import { useAuthStore } from "@/lib/authStore";
import { useLibrary } from "@/lib/store";
import { db } from "@/lib/db";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_GROUP = "22222222-2222-4222-8222-222222222222";

beforeEach(async () => {
  supabaseMock.configure({ session: fakeSession });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
  await resetDb();
});

describe("unshareSetFromGroup", () => {
  it("also takes the set out of that group's gatherings, and only that group's", async () => {
    const set = makeSet({ groupIds: [GROUP_ID, OTHER_GROUP] });
    const inGroup = makeGathering({ group_id: GROUP_ID, setIds: [set.id], updatedAt: 1000 });
    const elsewhere = makeGathering({ group_id: OTHER_GROUP, setIds: [set.id], updatedAt: 1000 });
    const personal = makeGathering({ setIds: [set.id], updatedAt: 1000 });
    await db.sets.put(set);
    await db.gatherings.bulkPut([inGroup, elsewhere, personal]);
    await useLibrary.getState().loadFromDb();

    await useLibrary.getState().unshareSetFromGroup(set.id, GROUP_ID);

    expect((await db.gatherings.get(inGroup.id))?.setIds).toEqual([]);
    expect((await db.gatherings.get(inGroup.id))?.updatedAt).toBeGreaterThan(1000);
    expect((await db.gatherings.get(elsewhere.id))?.setIds).toEqual([set.id]);
    expect((await db.gatherings.get(personal.id))?.setIds).toEqual([set.id]);
    expect((await db.sets.get(set.id))?.groupIds).toEqual([OTHER_GROUP]);
  });
});

describe("applyMerge keeps local collaboration tags", () => {
  it("carries groupIds over when adopting the remote version of a modified set", async () => {
    const local = makeSet({ name: "Local", groupIds: [GROUP_ID], shared_by: "me@x.com" });
    await db.sets.put(local);
    const remote = { ...local, name: "Remote", groupIds: undefined, shared_by: undefined };

    await applyMerge(emptyDiff({ modified: { sets: [{ local, remote }], gatherings: [] } }));

    const after = await db.sets.get(local.id);
    expect(after?.name).toBe("Remote");
    expect(after?.groupIds).toEqual([GROUP_ID]);
    expect(after?.shared_by).toBe("me@x.com");
  });
});
