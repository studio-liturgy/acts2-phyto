import { describe, expect, it } from "vitest";
import { nextOwnershipFilter, setRemoveMode } from "../group-catalogue";

describe("nextOwnershipFilter", () => {
  it("cycles off, Personal, Others, off", () => {
    let f: string = "all";
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      f = nextOwnershipFilter(f);
      seen.push(f);
    }
    expect(seen).toEqual(["personal", "others", "all", "personal"]);
  });

  it("starts at Personal when a kind chip is active", () => {
    expect(nextOwnershipFilter("song")).toBe("personal");
  });
});

describe("setRemoveMode", () => {
  const base = { groupIds: ["g1"], activeWorkspace: "g1" };

  it("lets the group admin remove someone else's set", () => {
    expect(setRemoveMode({ ...base, shared: true, isActiveGroupAdmin: true })).toBe(
      "remove-group-admin",
    );
  });

  it("hides the button for a member on someone else's set", () => {
    expect(setRemoveMode({ ...base, shared: true, isActiveGroupAdmin: false })).toBeNull();
  });

  it("hides it for an admin of another group viewing from Personal", () => {
    expect(
      setRemoveMode({
        ...base,
        activeWorkspace: "personal",
        shared: true,
        isActiveGroupAdmin: false,
      }),
    ).toBeNull();
  });

  it("keeps the existing modes for my own and person-shared sets", () => {
    expect(setRemoveMode({ ...base, shared: false, isActiveGroupAdmin: false })).toBe(
      "remove-group",
    );
    expect(
      setRemoveMode({
        shared: false,
        groupIds: [],
        activeWorkspace: "personal",
        isActiveGroupAdmin: false,
      }),
    ).toBe("delete");
    expect(
      setRemoveMode({
        shared: true,
        groupIds: [],
        activeWorkspace: "personal",
        isActiveGroupAdmin: false,
      }),
    ).toBe("remove-shared");
  });
});
