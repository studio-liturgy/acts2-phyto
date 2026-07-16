import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deterministicUuid,
  fromSupabaseGathering,
  fromSupabaseSet,
  gatheringContentKey,
  gatheringFingerprint,
  hasDifferences,
  latestRemoteTime,
  previewEffects,
  reconcileByContentKey,
  setContentKey,
  setFingerprint,
  stableStringify,
  toSupabaseGathering,
  toSupabaseSet,
} from "@/lib/sync";
import { emptyDiff, makeGathering, makeSet, USER_ID } from "@/test/fixtures";

describe("deterministicUuid", () => {
  it("is stable for the same inputs and distinct for different ones", async () => {
    const a = await deterministicUuid("gathering-1", "0");
    const b = await deterministicUuid("gathering-1", "0");
    const c = await deterministicUuid("gathering-1", "1");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe("stableStringify", () => {
  it("is insensitive to object key order", () => {
    expect(stableStringify({ b: 1, a: [{ y: 2, x: 3 }] })).toBe(
      stableStringify({ a: [{ x: 3, y: 2 }], b: 1 }),
    );
  });

  it("drops undefined keys, matching JSONB round-trips", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });

  it("distinguishes actually different values", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});

describe("Supabase row mappers", () => {
  afterEach(() => vi.useRealTimers());

  it("toSupabaseGathering omits is_live so a content push can't clobber the server's live flag", () => {
    const row = toSupabaseGathering(makeGathering({ is_live: true }), USER_ID, "device-1");
    expect("is_live" in row).toBe(false);
  });

  it("toSupabaseSet stamps synced_at with the current time", () => {
    vi.useFakeTimers({ now: new Date("2026-01-02T03:04:05.000Z") });
    const row = toSupabaseSet(makeSet(), USER_ID, "device-1");
    expect(row.synced_at).toBe("2026-01-02T03:04:05.000Z");
  });

  it("round-trips a set through toSupabaseSet/fromSupabaseSet", () => {
    const set = makeSet({ template: { bg: "black" }, loop: true });
    const back = fromSupabaseSet(toSupabaseSet(set, USER_ID, "device-1"));
    expect(back).toEqual(set);
  });

  it("fromSupabaseGathering backfills share_token and defaults null is_live to false", () => {
    const g = fromSupabaseGathering(
      {
        id: "g1",
        title: "Sunday",
        share_token: null,
        is_live: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      ["s1"],
    );
    expect(g.share_token).toHaveLength(10);
    expect(g.is_live).toBe(false);
    expect(g.setIds).toEqual(["s1"]);
  });
});

describe("content keys and fingerprints", () => {
  it("content keys normalize name whitespace and case", () => {
    const s = makeSet({ name: "  Amazing Grace " });
    expect(setContentKey(s)).toBe(setContentKey({ ...s, name: "amazing grace" }));
    const g = makeGathering({ name: "  Sunday " });
    expect(gatheringContentKey(g)).toBe(gatheringContentKey({ ...g, name: "sunday" }));
  });

  it("set fingerprint ignores timestamps but not content", () => {
    const s = makeSet();
    expect(setFingerprint(s)).toBe(setFingerprint({ ...s, updatedAt: s.updatedAt + 60_000 }));
    expect(setFingerprint(s)).not.toBe(setFingerprint({ ...s, name: "Renamed" }));
  });

  it("gathering fingerprint ignores is_live flips (server-authoritative, not content)", () => {
    const g = makeGathering({ is_live: false });
    expect(gatheringFingerprint(g)).toBe(gatheringFingerprint({ ...g, is_live: true }));
    expect(gatheringFingerprint(g)).not.toBe(gatheringFingerprint({ ...g, setIds: ["x"] }));
  });
});

describe("reconcileByContentKey", () => {
  it("pairs same-key items 1:1 and returns the reduced leftovers", () => {
    const local = [makeSet({ name: "A" }), makeSet({ name: "B" })];
    const remote = [makeSet({ name: "A" }), makeSet({ name: "C" })];
    const rec = reconcileByContentKey(local, remote, setContentKey);
    expect(rec.rekeyed).toHaveLength(1);
    expect(rec.rekeyed[0].local.name).toBe("A");
    expect(rec.rekeyed[0].remote.name).toBe("A");
    expect(rec.onlyLocal.map((s) => s.name)).toEqual(["B"]);
    expect(rec.onlyRemote.map((s) => s.name)).toEqual(["C"]);
  });

  it("pairs duplicate keys deterministically by (createdAt, id)", () => {
    // Same name/kind/slide-count/createdAt → identical content keys.
    const l1 = makeSet({ name: "A", id: "aaa" });
    const l2 = makeSet({ name: "A", id: "bbb" });
    const r1 = makeSet({ name: "A", id: "ccc" });
    const rec = reconcileByContentKey([l2, l1], [r1], setContentKey);
    // The createdAt/id-sorted first local ("aaa") wins the single remote twin.
    expect(rec.rekeyed.map((p) => p.local.id)).toEqual(["aaa"]);
    expect(rec.onlyLocal.map((s) => s.id)).toEqual(["bbb"]);
  });
});

describe("hasDifferences / latestRemoteTime", () => {
  it("hasDifferences is false for an empty diff and true for any populated bucket", () => {
    expect(hasDifferences(emptyDiff())).toBe(false);
    expect(hasDifferences(emptyDiff({ onlyLocal: { sets: [makeSet()], gatherings: [] } }))).toBe(
      true,
    );
    expect(hasDifferences(emptyDiff({ strandedLocal: { sets: [], gatherings: ["g1"] } }))).toBe(
      true,
    );
    expect(
      hasDifferences(
        emptyDiff({
          touched: { sets: [], gatherings: [{ local: makeGathering(), remote: makeGathering() }] },
        }),
      ),
    ).toBe(true);
  });

  it("latestRemoteTime excludes strandedLocal and touched so auto-healable diffs merge silently", () => {
    const g = makeGathering();
    const onlyAutoHealable = emptyDiff({
      strandedLocal: { sets: [{ localId: "a", remoteId: "b" }], gatherings: ["g1"] },
      touched: {
        sets: [],
        gatherings: [{ local: g, remote: { ...g, updatedAt: g.updatedAt + 5000 } }],
      },
    });
    expect(hasDifferences(onlyAutoHealable)).toBe(true);
    expect(latestRemoteTime(onlyAutoHealable)).toBeNull();
  });

  it("latestRemoteTime returns the max remote updatedAt across conflict buckets", () => {
    const s = makeSet({ updatedAt: 1700000001000 });
    const g = makeGathering({ updatedAt: 1700000009000 });
    const diff = emptyDiff({
      onlyRemote: { sets: [s], gatherings: [] },
      modified: { sets: [], gatherings: [{ local: makeGathering(), remote: g }] },
    });
    expect(latestRemoteTime(diff)?.getTime()).toBe(1700000009000);
  });
});

describe("previewEffects", () => {
  const s = makeSet({ name: "Local Song" });
  const rs = makeSet({ name: "Remote Song" });
  const diff = emptyDiff({
    onlyLocal: { sets: [s], gatherings: [] },
    onlyRemote: { sets: [rs], gatherings: [makeGathering({ name: "Remote Gathering" })] },
    modified: {
      sets: [{ local: makeSet({ name: "Mine" }), remote: makeSet({ name: "Theirs" }) }],
      gatherings: [],
    },
  });

  it("merge: local gains remote items, account gains local-only items", () => {
    const fx = previewEffects(diff, "merge");
    expect(fx.local.added.sets).toEqual(["Remote Song"]);
    expect(fx.local.added.gatherings).toEqual(["Remote Gathering"]);
    expect(fx.local.updated.sets).toEqual(["Theirs"]);
    expect(fx.account.added.sets).toEqual(["Local Song"]);
    expect(fx.account.removed.sets).toEqual([]);
    expect(fx.local.removed.sets).toEqual([]);
  });

  it("push: account mirrors local, losing remote-only items; local untouched", () => {
    const fx = previewEffects(diff, "push");
    expect(fx.account.added.sets).toEqual(["Local Song"]);
    expect(fx.account.updated.sets).toEqual(["Mine"]);
    expect(fx.account.removed.sets).toEqual(["Remote Song"]);
    expect(fx.local.added.sets).toEqual([]);
  });

  it("replace: local mirrors account, deleting local-only items; account untouched", () => {
    const fx = previewEffects(diff, "replace");
    expect(fx.local.added.sets).toEqual(["Remote Song"]);
    expect(fx.local.updated.sets).toEqual(["Theirs"]);
    expect(fx.local.removed.sets).toEqual(["Local Song"]);
    expect(fx.account.added.sets).toEqual([]);
  });
});
