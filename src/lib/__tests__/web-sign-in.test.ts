import { describe, expect, it } from "vitest";
import {
  answerMatches,
  appleName,
  appReturnUrl,
  appStartUrl,
  authorizeUrl,
  forwardFragment,
  isAppState,
  parseAnswer,
  readStart,
} from "../web-sign-in";

describe("web sign in", () => {
  it("sends Apple back to phyto's own address, with the hashed nonce", () => {
    const u = new URL(authorizeUrl("apple", "https://phytoexp.live", "s1", "h1"));
    expect(u.host).toBe("appleid.apple.com");
    expect(u.searchParams.get("client_id")).toBe("live.phyto.web");
    expect(u.searchParams.get("redirect_uri")).toBe("https://phytoexp.live/api/auth/apple");
    expect(u.searchParams.get("response_mode")).toBe("form_post");
    expect(u.searchParams.get("nonce")).toBe("h1");
    expect(u.searchParams.get("state")).toBe("s1");
  });

  it("sends Google back to /auth/web for an identity token", () => {
    const u = new URL(authorizeUrl("google", "https://phyto.live", "s2", "h2"));
    expect(u.host).toBe("accounts.google.com");
    expect(u.searchParams.get("redirect_uri")).toBe("https://phyto.live/auth/web");
    expect(u.searchParams.get("response_type")).toBe("id_token");
    expect(u.searchParams.get("nonce")).toBe("h2");
  });

  it("reads an answer, and tells a cancel from a failure", () => {
    expect(parseAnswer("#id_token=t&state=s")).toEqual({
      ok: true,
      idToken: "t",
      state: "s",
      name: "",
    });
    expect(parseAnswer("#error=access_denied&state=s")).toEqual({ ok: false, cancelled: true });
    expect(parseAnswer("#error=user_cancelled_authorize")).toEqual({
      ok: false,
      cancelled: true,
    });
    expect(parseAnswer("#state=s")).toEqual({ ok: false, cancelled: false });
  });

  it("keeps Apple's one-time name", () => {
    const user = JSON.stringify({ name: { firstName: "Grace", lastName: "Lee" } });
    expect(appleName(user)).toBe("Grace Lee");
    expect(appleName("not json")).toBe("");
    expect(parseAnswer(`#id_token=t&state=s&user=${encodeURIComponent(user)}`)).toMatchObject({
      name: "Grace Lee",
    });
  });

  it("forwards only the fields it uses from Apple's form", () => {
    const f = new URLSearchParams({ id_token: "t", state: "s", code: "secret-code", user: "" });
    expect(forwardFragment(f)).toBe("id_token=t&state=s");
  });

  it("accepts only the answer to this tab's own sign in", () => {
    const pending = { provider: "apple" as const, state: "abc", nonce: "n" };
    expect(answerMatches(pending, "abc")).toBe(true);
    expect(answerMatches(pending, "xyz")).toBe(false);
    expect(answerMatches(null, "abc")).toBe(false);
  });

  it("app: the sheet starts on phyto's address and Google returns to /auth/web", () => {
    const nonce = "a".repeat(64);
    const start = new URL(appStartUrl("https://phytoexp.live", "google", "app.12345678", nonce));
    expect(start.host).toBe("phytoexp.live");
    expect(start.pathname).toBe("/api/auth/start");
    const read = readStart(start.searchParams);
    expect(read).toEqual({ provider: "google", state: "app.12345678", nonce });
    const google = new URL(authorizeUrl(read!.provider, start.origin, read!.state, read!.nonce));
    expect(google.searchParams.get("redirect_uri")).toBe("https://phytoexp.live/auth/web");
  });

  it("app: /api/auth/start refuses anything but plain values", () => {
    const ok = "a".repeat(64);
    expect(
      readStart(new URLSearchParams({ provider: "x", state: "app.12345678", nonce: ok })),
    ).toBeNull();
    expect(
      readStart(new URLSearchParams({ provider: "google", state: "<script>", nonce: ok })),
    ).toBeNull();
    expect(
      readStart(new URLSearchParams({ provider: "google", state: "app.12345678", nonce: "zz" })),
    ).toBeNull();
  });

  it("app: an app sign in's answer goes back to the app, a browser's stays", () => {
    expect(isAppState("app.abc")).toBe(true);
    expect(isAppState("abc")).toBe(false);
    expect(isAppState(null)).toBe(false);
    expect(appReturnUrl("#id_token=t&state=app.abc")).toBe(
      "live.phyto.app://auth/callback#id_token=t&state=app.abc",
    );
  });
});
