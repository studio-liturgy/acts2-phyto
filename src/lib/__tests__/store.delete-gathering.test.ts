import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { fakeSession, makeGathering } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { db } from "@/lib/db";
import { useLibrary } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import { withSyncLock } from "@/lib/sync";

beforeEach(async () => {
  supabaseMock.configure({ session: fakeSession });
  useAuthStore.setState({ session: fakeSession });
  useLibrary.setState({ groups: [], activeWorkspace: "personal" });
  await resetDb();
});

describe("deleteGathering", () => {
  it("removes the gathering at once, even while a sync pass holds the lock", async () => {
    const g = makeGathering({});
    await db.gatherings.put(g);
    await useLibrary.getState().loadFromDb();
    expect(useLibrary.getState().gatherings[g.id]).toBeDefined();

    // A background sync pass is running: the delete has to wait for the lock.
    let release!: () => void;
    const held = withSyncLock(() => new Promise<void>((r) => (release = r)));

    const done = useLibrary.getState().deleteGathering(g.id);

    // Gone from the list straight away (the click), not after the network.
    expect(useLibrary.getState().gatherings[g.id]).toBeUndefined();
    expect(useLibrary.getState().gatheringOrder).not.toContain(g.id);

    // A re-derive from Dexie meanwhile (liveQuery, workspace load) must not
    // bring it back while the delete is still waiting.
    await useLibrary.getState().loadFromDb();
    expect(useLibrary.getState().gatherings[g.id]).toBeUndefined();

    release();
    await held;
    await done;
    expect(await db.gatherings.get(g.id)).toBeUndefined();
    expect(useLibrary.getState().gatherings[g.id]).toBeUndefined();
  });

  it("shows gatherings again once their delete has finished (no lingering filter)", async () => {
    const g = makeGathering({});
    await db.gatherings.put(g);
    await useLibrary.getState().deleteGathering(g.id);
    // Same id written back (e.g. an import of an old file) shows normally.
    await db.gatherings.put(g);
    await useLibrary.getState().loadFromDb();
    expect(useLibrary.getState().gatherings[g.id]).toBeDefined();
  });
});
