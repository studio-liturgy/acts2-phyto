import { describe, expect, it } from "vitest";
import { deleteConfirmMatches, deleteConfirmTarget } from "./delete-confirm";

const relay = "4tw48yvvyw@privaterelay.appleid.com";

describe("deleteConfirmTarget", () => {
  it("asks for the username, else the email", () => {
    expect(deleteConfirmTarget("valiantchan", relay)).toEqual({
      kind: "username",
      value: "valiantchan",
    });
    expect(deleteConfirmTarget(null, relay)).toEqual({ kind: "email", value: relay });
  });
});

describe("deleteConfirmMatches", () => {
  it("takes the username in any case, with or without @", () => {
    for (const t of ["valiantchan", "VALIANTCHAN", "@ValiantChan", " valiantchan "]) {
      expect(deleteConfirmMatches(t, "valiantchan", relay)).toBe(true);
    }
  });

  it("refuses anything else", () => {
    expect(deleteConfirmMatches("", "valiantchan", relay)).toBe(false);
    expect(deleteConfirmMatches("valiant", "valiantchan", relay)).toBe(false);
    expect(deleteConfirmMatches("someoneelse", "valiantchan", relay)).toBe(false);
  });

  it("still takes the email (older tabs, accounts without a username)", () => {
    expect(deleteConfirmMatches(relay.toUpperCase(), "valiantchan", relay)).toBe(true);
    expect(deleteConfirmMatches(relay, null, relay)).toBe(true);
    expect(deleteConfirmMatches("valiantchan", null, relay)).toBe(false);
  });
});
