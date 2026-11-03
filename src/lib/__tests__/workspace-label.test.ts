import { describe, expect, it } from "vitest";
import { workspaceLabel } from "../workspace-label";

const groups = [{ id: "g1", name: "Sunday Team" }];

describe("workspaceLabel", () => {
  it("shows Personal in the personal workspace", () => {
    expect(workspaceLabel("personal", groups, "Old")).toEqual({
      label: "Personal",
      isName: false,
    });
  });

  it("shows the cached group name before the group list has loaded", () => {
    expect(workspaceLabel("g1", [], "Sunday Team")).toEqual({
      label: "Sunday Team",
      isName: true,
    });
  });

  it("prefers the fetched name over the cached one", () => {
    expect(workspaceLabel("g1", groups, "Old name")).toEqual({
      label: "Sunday Team",
      isName: true,
    });
  });

  it("never shows Personal while a group is active", () => {
    expect(workspaceLabel("g1", [], "")).toEqual({ label: "Group", isName: false });
  });
});
