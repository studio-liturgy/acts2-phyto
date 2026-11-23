import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeGathering, makeSet } from "@/test/fixtures";
import { resetDb } from "@/test/db-utils";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { importCatalogue } from "@/lib/catalogue-io";
import { db } from "@/lib/db";
import { useLibrary } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";
import { supabaseMock } from "@/test/supabase-mock";

const USER = "33333333-3333-4333-8333-333333333333";

function phytoFile(sets: unknown[], gatherings: unknown[] = []): File {
  const body = { version: 2, exported_at: new Date().toISOString(), sets, gatherings };
  return new File([JSON.stringify(body)], "c.phyto");
}

beforeEach(async () => {
  await resetDb();
  supabaseMock.configure();
  useLibrary.setState({ groups: [] });
});

afterEach(() => {
  useAuthStore.setState({ session: null, isLoading: false });
});

describe("import counts as this device's newest edit", () => {
  it("stamps imported sets and gatherings with now, not the file's old time", async () => {
    const before = Date.now();
    const old = makeSet({ updatedAt: 1_000 });
    await importCatalogue(phytoFile([old], [makeGathering({ updatedAt: 1_000 })]), "merge");
    const [set] = await db.sets.toArray();
    const [gathering] = await db.gatherings.toArray();
    expect(set.updatedAt).toBeGreaterThanOrEqual(before);
    expect(gathering.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("signed in, Replace removes the sets and gatherings it cleared from the account too", async () => {
    useAuthStore.setState({
      session: { user: { id: USER, email: "a@x.com" } } as never,
      isLoading: false,
    });
    const gone = makeSet();
    const goneGathering = makeGathering();
    const kept = makeSet();
    const shared = makeSet({ shared: true, shared_by: "b@x.com" });
    await db.sets.bulkPut([gone, kept, shared]);
    await db.gatherings.put(goneGathering);

    await importCatalogue(phytoFile([kept]), "replace");

    const deletedSets = supabaseMock.callsFor("sets", "delete");
    expect(deletedSets).toHaveLength(1);
    expect(JSON.stringify(deletedSets[0])).toContain(gone.id);
    expect(JSON.stringify(deletedSets[0])).not.toContain(kept.id);
    expect(JSON.stringify(deletedSets[0])).not.toContain(shared.id);
    expect(supabaseMock.callsFor("gatherings", "delete")).toHaveLength(1);
    const tombstones = JSON.stringify(supabaseMock.callsFor("deletions", "upsert"));
    expect(tombstones).toContain(gone.id);
    expect(tombstones).toContain(goneGathering.id);
  });

  it("signed out, Replace touches nothing online", async () => {
    await db.sets.put(makeSet());
    await importCatalogue(phytoFile([makeSet()]), "replace");
    expect(supabaseMock.callsFor("sets", "delete")).toHaveLength(0);
    expect(supabaseMock.callsFor("deletions", "upsert")).toHaveLength(0);
  });
});
