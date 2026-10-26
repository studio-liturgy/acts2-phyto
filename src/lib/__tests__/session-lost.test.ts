import { describe, expect, it, vi } from "vitest";
import {
  createAuthGuard,
  isApiAuthFailure,
  MAX_FUTILE_RENEWALS,
  RENEW_COOLDOWN_MS,
  noteUserSignOut,
  safeNextPath,
  USER_SIGN_OUT_WINDOW_MS,
  wasUserSignOut,
  type RenewOutcome,
} from "../session-lost";

const BASE = "https://hphxsevacjcjfmyfifxz.supabase.co";

function setup(outcomes: RenewOutcome[]) {
  let t = 0;
  const renew = vi.fn(async () => outcomes.shift() ?? "renewed");
  const signOutLocal = vi.fn(async () => {});
  const onLost = vi.fn();
  const guard = createAuthGuard({ renew, signOutLocal, onLost, now: () => t });
  return {
    guard,
    renew,
    signOutLocal,
    onLost,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("isApiAuthFailure", () => {
  it("flags 401s from the data APIs only", () => {
    expect(isApiAuthFailure(`${BASE}/rest/v1/sets?on_conflict=id`, 401)).toBe(true);
    expect(isApiAuthFailure(`${BASE}/storage/v1/object/x`, 401)).toBe(true);
    expect(isApiAuthFailure(`${BASE}/rest/v1/sets`, 200)).toBe(false);
    expect(isApiAuthFailure(`${BASE}/rest/v1/sets`, 403)).toBe(false);
    expect(isApiAuthFailure(`${BASE}/auth/v1/token?grant_type=refresh_token`, 401)).toBe(false);
    expect(isApiAuthFailure("not a url", 401)).toBe(false);
  });
});

describe("createAuthGuard", () => {
  it("renews once for a burst of 401s", async () => {
    const s = setup(["renewed"]);
    await Promise.all([
      s.guard.reportUnauthorized(),
      s.guard.reportUnauthorized(),
      s.guard.reportUnauthorized(),
    ]);
    expect(s.renew).toHaveBeenCalledTimes(1);
    expect(s.onLost).not.toHaveBeenCalled();
  });

  it("signs out on this device and reports it when the server refuses renewal", async () => {
    const s = setup(["rejected"]);
    await s.guard.reportUnauthorized();
    expect(s.signOutLocal).toHaveBeenCalledTimes(1);
    expect(s.onLost).toHaveBeenCalledTimes(1);
    expect(s.guard.isLost()).toBe(true);
    // Later 401s do nothing more.
    s.advance(RENEW_COOLDOWN_MS * 2);
    await s.guard.reportUnauthorized();
    expect(s.renew).toHaveBeenCalledTimes(1);
    expect(s.onLost).toHaveBeenCalledTimes(1);
  });

  it("keeps the login when the auth server is just unreachable, retrying after the cooldown", async () => {
    const s = setup(["unreachable", "renewed"]);
    await s.guard.reportUnauthorized();
    expect(s.onLost).not.toHaveBeenCalled();
    s.advance(RENEW_COOLDOWN_MS - 1);
    await s.guard.reportUnauthorized();
    expect(s.renew).toHaveBeenCalledTimes(1);
    s.advance(1);
    await s.guard.reportUnauthorized();
    expect(s.renew).toHaveBeenCalledTimes(2);
    expect(s.onLost).not.toHaveBeenCalled();
  });

  it("gives up when renewals keep 'working' but requests are still refused", async () => {
    const s = setup([]);
    for (let i = 0; i <= MAX_FUTILE_RENEWALS; i++) {
      await s.guard.reportUnauthorized();
      s.advance(RENEW_COOLDOWN_MS);
    }
    expect(s.onLost).toHaveBeenCalledTimes(1);
  });

  it("a successful request in between resets the futile count", async () => {
    const s = setup([]);
    for (let i = 0; i < 10; i++) {
      await s.guard.reportUnauthorized();
      s.guard.reportOk();
      s.advance(RENEW_COOLDOWN_MS);
    }
    expect(s.onLost).not.toHaveBeenCalled();
  });

  it("replays the logged session: a refused login stops after one renewal instead of 15 minutes of 401s", async () => {
    // Sun, Oct 25 log: every ~12 s the poll fired 6 reads and sync re-pushed
    // ~25 rows, all 401, for 15 minutes. With the guard, the first burst
    // renews once, the server refuses, and the device signs out (which stops
    // the poll and push, as both run only with a session).
    const s = setup(["rejected"]);
    for (let tick = 0; tick < 75; tick++) {
      if (s.guard.isLost()) break;
      await Promise.all(Array.from({ length: 31 }, () => s.guard.reportUnauthorized()));
      s.advance(12_000);
    }
    expect(s.renew).toHaveBeenCalledTimes(1);
    expect(s.signOutLocal).toHaveBeenCalledTimes(1);
  });

  it("reset() after signing in again lets a later expiry be handled", async () => {
    const s = setup(["rejected", "rejected"]);
    await s.guard.reportUnauthorized();
    s.guard.reset();
    await s.guard.reportUnauthorized();
    expect(s.onLost).toHaveBeenCalledTimes(2);
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths only", () => {
    expect(safeNextPath("/present?g=1")).toBe("/present?g=1");
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("/login")).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});

describe("wasUserSignOut", () => {
  function mem() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  }

  it("is false when nothing was noted (phyto lost the login)", () => {
    expect(wasUserSignOut(mem(), 1_000)).toBe(false);
  });

  it("is true right after the user signs out, in any tab sharing the storage", () => {
    const store = mem();
    noteUserSignOut(store, 1_000);
    expect(wasUserSignOut(store, 1_200)).toBe(true);
  });

  it("expires, so a later lost login still shows the dialog", () => {
    const store = mem();
    noteUserSignOut(store, 1_000);
    expect(wasUserSignOut(store, 1_000 + USER_SIGN_OUT_WINDOW_MS)).toBe(false);
  });

  it("treats blocked storage as not chosen", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => noteUserSignOut(blocked, 1)).not.toThrow();
    expect(wasUserSignOut(blocked, 1)).toBe(false);
  });
});
