import { describe, expect, it } from "vitest";
import { newestWins } from "@/lib/sync";
import { emptyDiff, makeGathering, makeSet } from "@/test/fixtures";

describe("newestWins", () => {
  it("keeps a newer local edit out of the merge and marks it for pushing", () => {
    const local = makeSet({ name: "Phone edit", updatedAt: 2000 });
    const remote = { ...local, name: "Old", updatedAt: 1000 };
    const out = newestWins(emptyDiff({ modified: { sets: [{ local, remote }], gatherings: [] } }));
    expect(out.diff.modified.sets).toEqual([]);
    expect(out.pushSets).toEqual([local.id]);
  });

  it("lets a newer remote edit through to the merge (remote wins)", () => {
    const local = makeSet({ name: "Old", updatedAt: 1000 });
    const remote = { ...local, name: "Computer edit", updatedAt: 2000 };
    const out = newestWins(emptyDiff({ modified: { sets: [{ local, remote }], gatherings: [] } }));
    expect(out.diff.modified.sets).toHaveLength(1);
    expect(out.pushSets).toEqual([]);
  });

  it("does the same for gatherings, and leaves the other buckets alone", () => {
    const local = makeGathering({ setIds: ["b", "a"], updatedAt: 3000 });
    const remote = { ...local, setIds: ["a", "b"], updatedAt: 1000 };
    const added = makeSet();
    const out = newestWins(
      emptyDiff({
        modified: { sets: [], gatherings: [{ local, remote }] },
        onlyRemote: { sets: [added], gatherings: [] },
      }),
    );
    expect(out.pushGatherings).toEqual([local.id]);
    expect(out.diff.modified.gatherings).toEqual([]);
    expect(out.diff.onlyRemote.sets).toEqual([added]);
  });
});
