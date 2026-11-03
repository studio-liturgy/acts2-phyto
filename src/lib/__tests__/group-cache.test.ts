import { beforeEach, describe, expect, it } from "vitest";
import { clearCachedGroups, readCachedGroups, writeCachedGroups } from "../group-cache";
import type { MyGroup } from "../sync";

const groups: MyGroup[] = [{ id: "g1", name: "Sunday Team", role: "admin", owner_id: "u1" }];

describe("group cache", () => {
  beforeEach(() => localStorage.clear());

  it("returns the saved groups for the same account", () => {
    writeCachedGroups(localStorage, "u1", groups);
    expect(readCachedGroups(localStorage, "u1")).toEqual(groups);
  });

  it("never hands one account's groups to another", () => {
    writeCachedGroups(localStorage, "u1", groups);
    expect(readCachedGroups(localStorage, "u2")).toBeNull();
  });

  it("is empty after sign out clears it", () => {
    writeCachedGroups(localStorage, "u1", groups);
    clearCachedGroups(localStorage);
    expect(readCachedGroups(localStorage, "u1")).toBeNull();
  });

  it("ignores a damaged entry", () => {
    localStorage.setItem("phyto:my-groups-v1", "{not json");
    expect(readCachedGroups(localStorage, "u1")).toBeNull();
  });
});
