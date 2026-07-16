import { describe, expect, it, vi } from "vitest";

const signOutSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: signOutSpy } },
}));

import { signOut } from "@/lib/auth";

describe("signOut (regression 54618ca)", () => {
  it("signs out this device only", async () => {
    signOutSpy.mockResolvedValueOnce({ error: null });
    await signOut();
    expect(signOutSpy).toHaveBeenCalledWith({ scope: "local" });
  });

  it("resolves { error: null } even when the auth server is unreachable", async () => {
    // The local session must always clear; a thrown fetch error here used to
    // leave the user stuck signed in with SIGNED_OUT never firing.
    signOutSpy.mockRejectedValueOnce(new Error("network down"));
    await expect(signOut()).resolves.toEqual({ error: null });
  });
});
