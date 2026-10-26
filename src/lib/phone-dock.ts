// The phone editors' dock (PhoneDock in components/phone/PhoneChrome).

/** A button in the PhoneDock. */
export const PHONE_DOCK_ICON =
  "pill flex h-9 w-9 shrink-0 items-center justify-center transition active:bg-foreground/15 disabled:opacity-40";

/** After adding to the end of a set from the dock: scroll the editor to the
 *  bottom so the new line, section or point is in view (once it's rendered). */
export function scrollEditorToEnd(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(".has-dock [data-editor-scroll]");
      el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }),
  );
}

/** On a dock button: the tap doesn't take focus, so the keyboard stays up. */
export const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();
