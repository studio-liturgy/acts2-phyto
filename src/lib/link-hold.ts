/** Holding a link on a touch screen (the phone tab bar icons, Back, page
 *  links) must not open the system link menu. iOS honours the CSS in
 *  styles.css (`-webkit-touch-callout: none`); Android's browser and web view
 *  ignore it and show their own menu on `contextmenu`, so it is cancelled
 *  here. A mouse right click (pointerType "mouse") keeps its menu. */
export function isTouchLinkHold(e: Event): boolean {
  const kind = (e as PointerEvent).pointerType;
  if (kind !== "touch" && kind !== "pen") return false;
  const t = e.target;
  return t instanceof Element && t.closest("a[href]") !== null;
}

/** Start cancelling link menus on touch holds; returns the cleanup. */
export function blockLinkHoldMenu(doc: Document = document): () => void {
  const onMenu = (e: Event) => {
    if (isTouchLinkHold(e)) e.preventDefault();
  };
  doc.addEventListener("contextmenu", onMenu, { capture: true });
  return () => doc.removeEventListener("contextmenu", onMenu, { capture: true });
}
