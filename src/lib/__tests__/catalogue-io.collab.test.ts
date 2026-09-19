import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeGathering, makeSet } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { asOwnedGathering, asOwnedSet, exportableRows, importCatalogue } from "@/lib/catalogue-io";
import { db } from "@/lib/db";
import { useLibrary } from "@/lib/store";

const MY_GROUP = "11111111-1111-4111-8111-111111111111";
const NOT_MY_GROUP = "22222222-2222-4222-8222-222222222222";

beforeEach(async () => {
  await resetDb();
  useLibrary.setState({ groups: [] });
});

describe("export", () => {
  it("leaves out rows shared with me (they're someone else's, reached via a grant)", () => {
    const mine = makeSet();
    const theirs = makeSet({ shared: true, shared_by: "b@x.com" });
    const myGathering = makeGathering();
    const theirGathering = makeGathering({ shared: true, group_id: MY_GROUP });
    expect(exportableRows([mine, theirs]).map((s) => s.id)).toEqual([mine.id]);
    expect(exportableRows([myGathering, theirGathering]).map((p) => p.id)).toEqual([
      myGathering.id,
    ]);
  });
});

describe("import brings rows in as my own", () => {
  it("strips the collaboration tags off a set", () => {
    const s = makeSet({ shared: true, shared_by: "b@x.com", groupIds: [MY_GROUP] });
    const owned = asOwnedSet(s, new Set([MY_GROUP]));
    expect(owned.shared).toBeUndefined();
    expect(owned.shared_by).toBeUndefined();
    expect(owned.groupIds).toBeUndefined();
    expect(owned.slides).toEqual(s.slides);
  });

  it("keeps a group_id only for a group I'm in", () => {
    const inMine = makeGathering({ group_id: MY_GROUP, shared: true });
    const inTheirs = makeGathering({ group_id: NOT_MY_GROUP });
    const mine = new Set([MY_GROUP]);
    expect(asOwnedGathering(inMine, mine).group_id).toBe(MY_GROUP);
    expect(asOwnedGathering(inMine, mine).shared).toBeUndefined();
    expect(asOwnedGathering(inTheirs, mine).group_id).toBeUndefined();
    expect(asOwnedSet(makeSet({ group_id: NOT_MY_GROUP }), mine).group_id).toBeUndefined();
  });

  it("applies the rules when importing a file", async () => {
    useLibrary.setState({
      groups: [{ id: MY_GROUP, name: "Band", role: "member", owner_id: "someone" }],
    });
    const file = {
      version: 2,
      exported_at: new Date().toISOString(),
      sets: [makeSet({ shared: true, groupIds: [NOT_MY_GROUP], group_id: NOT_MY_GROUP })],
      gatherings: [makeGathering({ shared: true, group_id: MY_GROUP })],
    };
    await importCatalogue(new File([JSON.stringify(file)], "c.phyto"), "replace");

    const [set] = await db.sets.toArray();
    expect(set.shared).toBeUndefined();
    expect(set.groupIds).toBeUndefined();
    expect(set.group_id).toBeUndefined();
    const [gathering] = await db.gatherings.toArray();
    expect(gathering.shared).toBeUndefined();
    expect(gathering.group_id).toBe(MY_GROUP);
  });
});
