import { create } from "zustand";
import { isNativeApp } from "@/lib/native-app";

/**
 * "Use without an account": inside the phyto app only, a phone may skip
 * signing in and keep its library on the device. Phone and iPad browsers
 * always need an account (phone_layout.md, his decision Nov 8).
 *
 * The choice is remembered on the device (the app has its own storage, apart
 * from Safari/Chrome) and forgotten on sign in, so signing out later returns
 * to the landing.
 */

export const NO_ACCOUNT_KEY = "phyto-no-account";

function readChoice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(NO_ACCOUNT_KEY) === "1";
  } catch {
    return false;
  }
}

type NoAccountState = { chosen: boolean };

export const useNoAccountStore = create<NoAccountState>(() => ({ chosen: readChoice() }));

/** Remembers that this device uses phyto without an account. */
export function chooseNoAccount(): void {
  try {
    localStorage.setItem(NO_ACCOUNT_KEY, "1");
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  useNoAccountStore.setState({ chosen: true });
}

/** Forgets the choice (on sign in). */
export function clearNoAccount(): void {
  try {
    localStorage.removeItem(NO_ACCOUNT_KEY);
  } catch {
    // Nothing stored.
  }
  useNoAccountStore.setState({ chosen: false });
}

/** Whether a signed-out phone may use the library: the app, after the choice. */
export function noAccountAllowed(chosen: boolean, nativeApp: boolean): boolean {
  return nativeApp && chosen;
}

/** Hook form of `noAccountAllowed` for the current page. Read it only after
 *  mount (phone branches render after usePhoneLayout resolves). */
export function useNoAccount(): boolean {
  const chosen = useNoAccountStore((s) => s.chosen);
  return noAccountAllowed(chosen, isNativeApp());
}
