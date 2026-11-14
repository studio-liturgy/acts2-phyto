import { describe, expect, it } from "vitest";
import { callbackPath, sha256Hex } from "./app-sign-in";

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

describe("sha256Hex", () => {
  it("hashes like Apple expects (hex SHA-256)", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
