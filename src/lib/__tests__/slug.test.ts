import { describe, it, expect } from "vitest";
import { normalizeSlug, validateSlug, slugErrorMessage, SLUG_MAX } from "../slug";

describe("normalizeSlug", () => {
  it("lowercases and hyphenates whitespace/underscores", () => {
    expect(normalizeSlug("My Gathering")).toBe("my-gathering");
    expect(normalizeSlug("redeemer_church")).toBe("redeemer-church");
    expect(normalizeSlug("  Sunday   Service  ")).toBe("sunday-service");
  });

  it("strips characters outside [a-z0-9-]", () => {
    expect(normalizeSlug("Café & Co.")).toBe("caf-co");
    expect(normalizeSlug("hello!@#world")).toBe("helloworld");
  });

  it("collapses and trims hyphens", () => {
    expect(normalizeSlug("--a---b--")).toBe("a-b");
    expect(normalizeSlug("a  -  b")).toBe("a-b");
  });

  it("returns empty string for all-invalid input", () => {
    expect(normalizeSlug("!!!")).toBe("");
    expect(normalizeSlug("   ")).toBe("");
  });
});

describe("validateSlug", () => {
  it("accepts a well-formed slug", () => {
    expect(validateSlug("redeemer-church")).toEqual({ ok: true });
    expect(validateSlug("gz2")).toEqual({ ok: true });
  });

  it("rejects too short / too long", () => {
    expect(validateSlug("ab")).toEqual({ ok: false, reason: "too-short" });
    expect(validateSlug("a".repeat(SLUG_MAX + 1))).toEqual({ ok: false, reason: "too-long" });
  });

  it("rejects invalid characters and stray hyphens", () => {
    expect(validateSlug("Hello")).toEqual({ ok: false, reason: "invalid-chars" });
    expect(validateSlug("-abc")).toEqual({ ok: false, reason: "invalid-chars" });
    expect(validateSlug("a--b")).toEqual({ ok: false, reason: "invalid-chars" });
  });

  it("rejects reserved words", () => {
    expect(validateSlug("admin")).toEqual({ ok: false, reason: "reserved" });
    expect(validateSlug("api")).toEqual({ ok: false, reason: "reserved" });
  });

  it("agrees with normalizeSlug output", () => {
    const s = normalizeSlug("Grace Community Church");
    expect(validateSlug(s)).toEqual({ ok: true });
  });
});

describe("slugErrorMessage", () => {
  it("returns a message for every reason", () => {
    for (const r of ["too-short", "too-long", "invalid-chars", "reserved"] as const) {
      expect(slugErrorMessage(r)).toMatch(/\S/);
    }
  });
});
