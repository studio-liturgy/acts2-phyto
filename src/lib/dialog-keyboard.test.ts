import { describe, expect, it } from "vitest";
import { dialogKeyboardBox } from "./dialog-keyboard";

describe("dialogKeyboardBox", () => {
  it("is the visible part above the keyboard", () => {
    expect(dialogKeyboardBox({ innerHeight: 800, vvHeight: 460.4, vvTop: 0 })).toEqual({
      top: 0,
      height: 460,
    });
  });
  it("follows the view when iOS has panned the page", () => {
    expect(dialogKeyboardBox({ innerHeight: 800, vvHeight: 460, vvTop: 120.6 })).toEqual({
      top: 121,
      height: 460,
    });
  });
  it("ignores the browser bar sliding (no keyboard)", () => {
    expect(dialogKeyboardBox({ innerHeight: 800, vvHeight: 740, vvTop: 0 })).toBeNull();
    expect(dialogKeyboardBox({ innerHeight: 800, vvHeight: 800, vvTop: 0 })).toBeNull();
  });
});
