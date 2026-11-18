import { describe, expect, it } from "vitest";
import { blockLinkHoldMenu, isTouchLinkHold } from "../link-hold";

function menuEvent(target: Element, pointerType: string): Event {
  const e = new Event("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  Object.defineProperty(e, "target", { value: target });
  return e;
}

describe("link hold menu", () => {
  const a = document.createElement("a");
  a.href = "/about";
  const icon = document.createElement("span");
  a.appendChild(icon);
  const plain = document.createElement("div");

  it("cancels a touch hold on a link or anything inside it", () => {
    expect(isTouchLinkHold(menuEvent(a, "touch"))).toBe(true);
    expect(isTouchLinkHold(menuEvent(icon, "touch"))).toBe(true);
  });

  it("leaves a mouse right click and non-links alone", () => {
    expect(isTouchLinkHold(menuEvent(a, "mouse"))).toBe(false);
    expect(isTouchLinkHold(menuEvent(plain, "touch"))).toBe(false);
  });

  it("prevents the menu once started and stops after cleanup", () => {
    document.body.appendChild(a);
    const stop = blockLinkHoldMenu(document);
    const e1 = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    Object.defineProperty(e1, "pointerType", { value: "touch" });
    icon.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);
    stop();
    const e2 = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    Object.defineProperty(e2, "pointerType", { value: "touch" });
    icon.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
    a.remove();
  });
});
