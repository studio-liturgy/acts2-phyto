import { describe, expect, it } from "vitest";
import { canDrive, ownerOfSlug, roomName } from "../screen-auth";

const URL_ = "https://db.example";
const KEY = "anon";

/** A fake fetch answering by URL prefix; records the auth header it saw. */
function fakeFetch(routes: Record<string, { ok?: boolean; body: unknown }>) {
  const seen: string[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    seen.push(`${url} ${(init?.headers as Record<string, string>)?.authorization ?? ""}`);
    const key = Object.keys(routes).find((k) => url.startsWith(URL_ + k));
    const r = key ? routes[key] : { ok: false, body: null };
    return new Response(JSON.stringify(r.body), { status: r.ok === false ? 401 : 200 });
  };
  return { fn, seen };
}

describe("screen room access", () => {
  it("reads a slug's owner with the public key", async () => {
    const f = fakeFetch({
      "/rest/v1/account_slugs": { body: [{ user_id: "u1", group_id: null }] },
    });
    expect(await ownerOfSlug("my-church", URL_, KEY, f.fn)).toEqual({
      userId: "u1",
      groupId: null,
    });
    expect(f.seen[0]).toContain("slug=eq.my-church");
    expect(f.seen[0]).toContain("Bearer anon");
  });

  it("an unknown slug has no owner", async () => {
    const f = fakeFetch({ "/rest/v1/account_slugs": { body: [] } });
    expect(await ownerOfSlug("nope", URL_, KEY, f.fn)).toBeNull();
  });

  it("one room per account or group", () => {
    expect(roomName({ userId: "u1", groupId: null })).toBe("u:u1");
    expect(roomName({ userId: "u1", groupId: "g1" })).toBe("g:g1");
  });

  it("a personal link: only its own account drives it", async () => {
    const me = fakeFetch({ "/auth/v1/user": { body: { id: "u1" } } });
    expect(await canDrive("tok", { userId: "u1", groupId: null }, URL_, KEY, me.fn)).toBe(true);
    expect(me.seen[0]).toContain("Bearer tok");
    const other = fakeFetch({ "/auth/v1/user": { body: { id: "u2" } } });
    expect(await canDrive("tok", { userId: "u1", groupId: null }, URL_, KEY, other.fn)).toBe(false);
  });

  it("a bad or missing login drives nothing", async () => {
    const bad = fakeFetch({ "/auth/v1/user": { ok: false, body: {} } });
    expect(await canDrive("tok", { userId: "u1", groupId: null }, URL_, KEY, bad.fn)).toBe(false);
    expect(await canDrive("", { userId: "u1", groupId: null }, URL_, KEY, bad.fn)).toBe(false);
  });

  it("a group link: its owner or any member", async () => {
    const owner = fakeFetch({
      "/auth/v1/user": { body: { id: "boss" } },
      "/rest/v1/groups": { body: [{ owner_id: "boss" }] },
    });
    expect(await canDrive("t", { userId: "boss", groupId: "g1" }, URL_, KEY, owner.fn)).toBe(true);
    const member = fakeFetch({
      "/auth/v1/user": { body: { id: "m1" } },
      "/rest/v1/groups": { body: [{ owner_id: "boss" }] },
      "/rest/v1/group_members": { body: [{ user_id: "m1" }] },
    });
    expect(await canDrive("t", { userId: "boss", groupId: "g1" }, URL_, KEY, member.fn)).toBe(true);
    // An invitee can read the group row but isn't a member yet.
    const invitee = fakeFetch({
      "/auth/v1/user": { body: { id: "i1" } },
      "/rest/v1/groups": { body: [{ owner_id: "boss" }] },
      "/rest/v1/group_members": { body: [] },
    });
    expect(await canDrive("t", { userId: "boss", groupId: "g1" }, URL_, KEY, invitee.fn)).toBe(
      false,
    );
  });
});
