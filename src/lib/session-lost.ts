import { create } from "zustand";

/** What happened when we tried to renew the login after a 401. */
export type RenewOutcome =
  /** Got a fresh access token. */
  | "renewed"
  /** The server refused the refresh token (signed out elsewhere, revoked). */
  | "rejected"
  /** Couldn't reach the auth server (offline, timeout). Try again later. */
  | "unreachable";

export interface AuthGuardDeps {
  renew: () => Promise<RenewOutcome>;
  /** Drop the session on this device only. */
  signOutLocal: () => Promise<void>;
  /** The login is gone for good: tell the user. */
  onLost: () => void;
  now: () => number;
}

/** Minimum gap between renewal attempts, so a burst of failing requests (or a
 *  renewal that can't reach the server) doesn't turn into a refresh storm. */
export const RENEW_COOLDOWN_MS = 30_000;
/** Renewals that "worked" but were followed by another 401 before any request
 *  succeeded. Past this, renewing isn't fixing anything: give up and sign out
 *  rather than retrying forever. */
export const MAX_FUTILE_RENEWALS = 2;

/** A 401 from the data APIs (PostgREST, Storage, Functions) means the access
 *  token the client sent was refused. Auth endpoints are excluded: their own
 *  failures are handled by the renewal itself. */
export function isApiRequest(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return (
    path.startsWith("/rest/v1/") ||
    path.startsWith("/storage/v1/") ||
    path.startsWith("/functions/v1/")
  );
}

export function isApiAuthFailure(url: string, status: number): boolean {
  return status === 401 && isApiRequest(url);
}

/** Watches API responses and reacts to a refused login: renew once (one
 *  attempt at a time, with a cooldown), and if the server won't renew it,
 *  sign out on this device and report it. Pure apart from its deps, so the
 *  whole sequence is unit-tested. */
export function createAuthGuard(deps: AuthGuardDeps) {
  let inFlight: Promise<void> | null = null;
  let lastAttempt = Number.NEGATIVE_INFINITY;
  let futileRenewals = 0;
  let lost = false;

  async function declareLost() {
    if (lost) return;
    lost = true;
    await deps.signOutLocal();
    deps.onLost();
  }

  async function attempt() {
    lastAttempt = deps.now();
    const outcome = await deps.renew();
    if (outcome === "rejected") return declareLost();
    if (outcome === "renewed") {
      futileRenewals += 1;
      if (futileRenewals > MAX_FUTILE_RENEWALS) return declareLost();
    }
    // "unreachable": leave it; the next 401 after the cooldown tries again.
  }

  return {
    /** An API request came back 401. Resolves once any renewal it started is done. */
    reportUnauthorized(): Promise<void> {
      if (lost) return Promise.resolve();
      if (inFlight) return inFlight;
      if (deps.now() - lastAttempt < RENEW_COOLDOWN_MS) return Promise.resolve();
      inFlight = attempt().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    /** An API request succeeded: the current token works. */
    reportOk() {
      futileRenewals = 0;
    },
    /** Signed in again: start fresh. */
    reset() {
      lost = false;
      futileRenewals = 0;
      lastAttempt = Number.NEGATIVE_INFINITY;
    },
    isLost: () => lost,
  };
}

interface SessionLostStore {
  /** Signed out because the login expired (not because the user chose to). */
  lost: boolean;
  dialogOpen: boolean;
  markLost: () => void;
  /** Re-open the dialog when a cloud action is tried while signed out by expiry. */
  prompt: () => void;
  close: () => void;
  clear: () => void;
}

export const useSessionLost = create<SessionLostStore>((set) => ({
  lost: false,
  dialogOpen: false,
  markLost: () => set({ lost: true, dialogOpen: true }),
  prompt: () => set((s) => (s.lost ? { dialogOpen: true } : s)),
  close: () => set({ dialogOpen: false }),
  clear: () => set({ lost: false, dialogOpen: false }),
}));

// Sign-outs the user chose (the Sign out button, deleting the account) go
// through lib/auth's signOut, which stamps this key first. Any other SIGNED_OUT
// (a refused refresh, a session cleared on load, another tab's expiry) is phyto
// losing the login, so the signed-out dialog shows. Kept in localStorage so a
// sign-out in one tab doesn't pop the dialog in the others.
const USER_SIGN_OUT_KEY = "phyto-user-signout";
export const USER_SIGN_OUT_WINDOW_MS = 15_000;

type KeyStore = Pick<Storage, "getItem" | "setItem">;

export function noteUserSignOut(storage: KeyStore, now: number): void {
  try {
    storage.setItem(USER_SIGN_OUT_KEY, String(now));
  } catch {
    // Storage full or blocked: worst case the dialog shows after a chosen sign-out.
  }
}

export function wasUserSignOut(storage: KeyStore, now: number): boolean {
  let raw: string | null = null;
  try {
    raw = storage.getItem(USER_SIGN_OUT_KEY);
  } catch {
    return false;
  }
  const t = Number(raw);
  return raw !== null && Number.isFinite(t) && now - t >= 0 && now - t < USER_SIGN_OUT_WINDOW_MS;
}

/** Only same-site paths are allowed as the post-login destination. */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/login")) return null;
  return next;
}
