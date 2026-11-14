import { describe, expect, it } from "vitest";
import { callbackPath } from "./app-sign-in";

describe("callbackPath", () => {
  it("keeps the code (PKCE) and the tokens (implicit)", () => {
    expect(callbackPath("live.phyto.app://auth/callback?code=abc")).toBe("/auth/callback?code=abc");
    expect(callbackPath("live.phyto.app://auth/callback#access_token=x&refresh_token=y")).toBe(
      "/auth/callback#access_token=x&refresh_token=y",
    );
  });
  it("refuses anything that isn't the app's own scheme", () => {
    expect(callbackPath("https://phyto.live/auth/callback?code=abc")).toBeNull();
    expect(callbackPath("not a url")).toBeNull();
  });
});
