import { describe, expect, it } from "vitest";
import { myHandleFrom, needsWelcome, suggestDisplayName, suggestHandle } from "./profile";
import { handleProblem } from "./handle";

describe("myHandleFrom", () => {
  const p = { user_id: "u1", handle: "grace", display_name: "Grace" };
  const cached = { userId: "u1", handle: "grace_old" };
  it("shows the loaded username", () => {
    expect(myHandleFrom(p, "u1", cached)).toBe("grace");
  });
  it("shows the device's last copy while loading or after a failed load", () => {
    expect(myHandleFrom(undefined, "u1", cached)).toBe("grace_old");
    expect(myHandleFrom("error", "u1", cached)).toBe("grace_old");
  });
  it("never shows another account's copy", () => {
    expect(myHandleFrom(undefined, "u2", cached)).toBeNull();
  });
  it("shows nothing when the account has no username or nobody is signed in", () => {
    expect(myHandleFrom(null, "u1", cached)).toBeNull();
    expect(myHandleFrom(undefined, null, cached)).toBeNull();
  });
});

describe("suggestHandle", () => {
  it("starts from the name", () => {
    expect(suggestHandle("vc@live.com", "Valiant Chan")).toBe("valiantchan");
  });
  it("falls back to the email", () => {
    expect(suggestHandle("grace.lee@gmail.com")).toBe("grace_lee");
  });
  it("never uses a Hide My Email address", () => {
    expect(suggestHandle("x7k2m9qp4r@privaterelay.appleid.com")).toBe("");
  });
  it("gives only valid handles", () => {
    expect(handleProblem(suggestHandle("ab@x.com"))).not.toBeNull();
    expect(suggestHandle("ab@x.com")).toBe("");
  });
});

describe("suggestDisplayName", () => {
  it("prefers Google's name, then Apple's", () => {
    expect(suggestDisplayName({ user_metadata: { full_name: "Grace Lee" } }, "G L")).toBe(
      "Grace Lee",
    );
    expect(suggestDisplayName({ user_metadata: {} }, "Grace Lee")).toBe("Grace Lee");
  });
});

describe("needsWelcome", () => {
  it("asks a signed-in account with no username", () => {
    expect(needsWelcome("/", true, null)).toBe(true);
  });
  it("waits while loading or after an error", () => {
    expect(needsWelcome("/", true, undefined)).toBe(false);
    expect(needsWelcome("/", true, "error")).toBe(false);
  });
  it("never on live links, sign in or the screen", () => {
    expect(needsWelcome("/g/abc", true, null)).toBe(false);
    expect(needsWelcome("/screen/abc", true, null)).toBe(false);
    expect(needsWelcome("/login", true, null)).toBe(false);
  });
});

describe("reserved names", () => {
  it("are blocked, except for the studio's own account", () => {
    expect(handleProblem("studioliturgy", "someone@gmail.com")).toBe("reserved");
    expect(handleProblem("studioliturgy", "Hello@StudioLiturgy.com")).toBeNull();
  });
});
