// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  APPLE_APP_CLIENT_ID,
  APPLE_TEAM_ID,
  appleClientSecret,
  appleDeleteNote,
  appleSubject,
  hasAppleSignIn,
  jwtSubject,
  revokeAppleSignIn,
} from "./apple-revoke";

async function throwawayKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = Buffer.from(pkcs8).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  return { pem, publicKey: pair.publicKey };
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const out = new Uint8Array(new ArrayBuffer(b.length));
  out.set(b);
  return out;
}

function fakeIdToken(sub: string): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc({ sub, aud: APPLE_APP_CLIENT_ID })}.sig`;
}

describe("hasAppleSignIn", () => {
  it("finds an Apple identity or provider", () => {
    expect(hasAppleSignIn({ identities: [{ provider: "email" }, { provider: "apple" }] })).toBe(
      true,
    );
    expect(hasAppleSignIn({ app_metadata: { providers: ["email", "apple"] } })).toBe(true);
    expect(hasAppleSignIn({ app_metadata: { provider: "apple" } })).toBe(true);
    expect(hasAppleSignIn({ app_metadata: { providers: ["email", "google"] } })).toBe(false);
    expect(hasAppleSignIn(null)).toBe(false);
  });
});

describe("appleSubject", () => {
  it("reads the Apple identity's sub", () => {
    expect(
      appleSubject({
        identities: [
          { provider: "google", identity_data: { sub: "g1" } },
          { provider: "apple", id: "x", identity_data: { sub: "001.abc" } },
        ],
      }),
    ).toBe("001.abc");
    expect(appleSubject({ identities: [{ provider: "apple", id: "001.def" }] })).toBe("001.def");
    expect(appleSubject({ identities: [{ provider: "email", id: "e" }] })).toBeNull();
  });
});

describe("appleDeleteNote", () => {
  it("gives the app line, the browser line, or nothing", () => {
    expect(appleDeleteNote(true, true)).toBe("Confirm with Apple to finish.");
    expect(appleDeleteNote(true, false)).toBe(
      "To finish, remove phyto under Sign in with Apple in your Apple Account settings.",
    );
    expect(appleDeleteNote(false, true)).toBeNull();
  });
});

describe("appleClientSecret", () => {
  it("signs an ES256 JWT Apple can verify", async () => {
    const { pem, publicKey } = await throwawayKey();
    const jwt = await appleClientSecret({
      teamId: APPLE_TEAM_ID,
      keyId: "ABCDE12345",
      privateKeyPem: pem,
      clientId: APPLE_APP_CLIENT_ID,
      nowS: 1_800_000_000,
    });
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "ABCDE12345",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toEqual({
      iss: APPLE_TEAM_ID,
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      aud: "https://appleid.apple.com",
      sub: APPLE_APP_CLIENT_ID,
    });
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      b64urlDecode(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });

  it("accepts a key pasted with literal \\n", async () => {
    const { pem } = await throwawayKey();
    const jwt = await appleClientSecret({
      teamId: APPLE_TEAM_ID,
      keyId: "K",
      privateKeyPem: pem.replace(/\n/g, "\\n"),
      clientId: APPLE_APP_CLIENT_ID,
    });
    expect(jwt.split(".")).toHaveLength(3);
  });
});

describe("jwtSubject", () => {
  it("reads sub, or null for junk", () => {
    expect(jwtSubject(fakeIdToken("001.abc"))).toBe("001.abc");
    expect(jwtSubject("nope")).toBeNull();
  });
});

describe("revokeAppleSignIn", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it("exchanges the code, then revokes the refresh token", async () => {
    const { pem } = await throwawayKey();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(ok({ refresh_token: "r1", id_token: fakeIdToken("001.abc") }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const r = await revokeAppleSignIn({
      code: "c1",
      expectedSub: "001.abc",
      keyId: "K",
      privateKeyPem: pem,
      fetchFn,
    });
    expect(r).toBe("revoked");
    const [url1, init1] = fetchFn.mock.calls[0];
    expect(url1).toBe("https://appleid.apple.com/auth/token");
    const body1 = new URLSearchParams(init1.body);
    expect(body1.get("code")).toBe("c1");
    expect(body1.get("client_id")).toBe(APPLE_APP_CLIENT_ID);
    expect(body1.get("grant_type")).toBe("authorization_code");
    const [url2, init2] = fetchFn.mock.calls[1];
    expect(url2).toBe("https://appleid.apple.com/auth/revoke");
    const body2 = new URLSearchParams(init2.body);
    expect(body2.get("token")).toBe("r1");
    expect(body2.get("token_type_hint")).toBe("refresh_token");
  });

  it("never revokes a different Apple ID", async () => {
    const { pem } = await throwawayKey();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(ok({ refresh_token: "r1", id_token: fakeIdToken("001.other") }));
    const r = await revokeAppleSignIn({
      code: "c1",
      expectedSub: "001.abc",
      keyId: "K",
      privateKeyPem: pem,
      fetchFn,
    });
    expect(r).toBe("other-apple-id");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("reports a failed exchange or revoke, and a missing key, without throwing", async () => {
    const { pem } = await throwawayKey();
    const bad = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 400 }));
    expect(
      await revokeAppleSignIn({
        code: "c",
        expectedSub: "s",
        keyId: "K",
        privateKeyPem: pem,
        fetchFn: bad,
      }),
    ).toBe("exchange-failed");
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    expect(
      await revokeAppleSignIn({
        code: "c",
        expectedSub: "s",
        keyId: "K",
        privateKeyPem: pem,
        fetchFn: down,
      }),
    ).toBe("revoke-failed");
    expect(
      await revokeAppleSignIn({
        code: "c",
        expectedSub: "s",
        keyId: undefined,
        privateKeyPem: pem,
      }),
    ).toBe("not-configured");
  });
});
