import { describe, expect, it } from "vitest";
import { canDeleteGathering } from "./group-catalogue";

const groups = [
  { id: "g1", owner_id: "admin" },
  { id: "g2", owner_id: "someone" },
];

describe("canDeleteGathering", () => {
  it("lets the owner delete their own gathering, personal or group", () => {
    expect(canDeleteGathering({}, groups, "me")).toBe(true);
    expect(canDeleteGathering({ group_id: "g2" }, groups, "me")).toBe(true);
  });
  it("lets the group admin delete another member's gathering", () => {
    expect(canDeleteGathering({ shared: true, group_id: "g1" }, groups, "admin")).toBe(true);
  });
  it("hides Delete from members on gatherings they don't own", () => {
    expect(canDeleteGathering({ shared: true, group_id: "g2" }, groups, "admin")).toBe(false);
    expect(canDeleteGathering({ shared: true, group_id: "g1" }, groups, "member")).toBe(false);
  });
  it("hides Delete when signed out or the group is unknown", () => {
    expect(canDeleteGathering({ shared: true, group_id: "g1" }, groups, null)).toBe(false);
    expect(canDeleteGathering({ shared: true, group_id: "g9" }, groups, "admin")).toBe(false);
    expect(canDeleteGathering({ shared: true }, groups, "admin")).toBe(false);
  });
});
