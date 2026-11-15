import { describe, expect, it } from "vitest";
import { needsWelcome, suggestDisplayName, suggestHandle } from "./profile";
import { handleProblem } from "./handle";

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
