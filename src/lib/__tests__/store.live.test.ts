import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { fakeSession, gatheringRow, makeGathering, USER_ID } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { db } from "@/lib/db";
import { useLibrary } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "00000000-0000-4000-8000-000000000099";

beforeEach(async () => {
  supabaseMock.configure({ session: fakeSession });
  useAuthStore.setState({ session: fakeSession });
  useLibrary.setState({ groups: [] });
  await resetDb();
});

describe("refreshLiveState", () => {
  it("reads only my gatherings and my groups' — never the whole (publicly readable) table", async () => {
    const mine = makeGathering({ is_live: false });
    const group = makeGathering({ group_id: GROUP_ID, is_live: false });
    const someoneElses = makeGathering({ is_live: true, live_started_at: Date.now() });
    await db.gatherings.bulkPut([mine, group]);

    supabaseMock.configure({
      session: fakeSession,
      tables: {
        gatherings: [
          { ...gatheringRow(mine), is_live: true, live_started_at: new Date().toISOString() },
          {
            ...gatheringRow(group, OTHER_USER),
            group_id: GROUP_ID,
            is_live: true,
            live_started_at: new Date().toISOString(),
          },
          gatheringRow(someoneElses, OTHER_USER),
        ],
      },
    });

    await useLibrary.getState().refreshLiveState();

    // The query is scoped: my rows OR rows in a group I'm in (derived from the
    // local gatherings' group_id, so it works before the group list has loaded).
    const [call] = supabaseMock.callsFor("gatherings", "select");
    expect(call.filters).toEqual([
      {
        kind: "or",
        column: "",
        value: [
          { kind: "eq", column: "user_id", value: USER_ID },
          { kind: "in", column: "group_id", value: [GROUP_ID] },
        ],
      },
    ]);

    // Both of my visible gatherings picked up the server's live flag.
    expect((await db.gatherings.get(mine.id))?.is_live).toBe(true);
    expect((await db.gatherings.get(group.id))?.is_live).toBe(true);
  });

  it("falls back to a plain user_id filter when there are no groups in play", async () => {
    const mine = makeGathering();
    await db.gatherings.put(mine);
    supabaseMock.configure({ session: fakeSession, tables: { gatherings: [gatheringRow(mine)] } });

    await useLibrary.getState().refreshLiveState();

    const [call] = supabaseMock.callsFor("gatherings", "select");
    expect(call.filters).toEqual([{ kind: "eq", column: "user_id", value: USER_ID }]);
  });

  it("also scopes by the store's group list, for a group with no local gatherings yet", async () => {
    useLibrary.setState({
      groups: [{ id: GROUP_ID, name: "Band", role: "member", owner_id: OTHER_USER }],
    });
    supabaseMock.configure({ session: fakeSession, tables: { gatherings: [] } });

    await useLibrary.getState().refreshLiveState();

    const [call] = supabaseMock.callsFor("gatherings", "select");
    expect(call.filters[0]).toMatchObject({ kind: "or" });
    expect((call.filters[0] as { value: unknown[] }).value).toContainEqual({
      kind: "in",
      column: "group_id",
      value: [GROUP_ID],
    });
  });
});
