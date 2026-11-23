// Sign in with Apple token revocation on account deletion (Apple's rule for
// apps that offer Sign in with Apple). The app's Delete Account asks Apple's
// sheet for a fresh authorization code; the server trades it for Apple's
// refresh token and revokes that, so phyto disappears from the person's
// "Sign in with Apple" list. Nothing is stored between sign-in and deletion.
//
// Server side: the client secret is a short-lived ES256 JWT signed with the
// Sign in with Apple key (.p8), made per request with WebCrypto.

/** The app's bundle id: the client id the native sheet's codes belong to. */
export const APPLE_APP_CLIENT_ID = "live.phyto.app";

/** The Apple Developer team (individual enrollment). */
export const APPLE_TEAM_ID = "U6CKR43ZU8";

const APPLE_AUD = "https://appleid.apple.com";

type UserLike = {
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
  identities?: Array<{ provider?: string | null }> | null;
};

/** Whether this account can sign in with Apple. */
export function hasAppleSignIn(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  if (user.identities?.some((i) => i.provider === "apple")) return true;
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes("apple")) return true;
  return user.app_metadata?.provider === "apple";
}

/** Apple's own id for this person (the identity's `sub`), or null. */
export function appleSubject(
  user: {
    identities?: Array<{
      provider?: string | null;
      id?: string | null;
      identity_data?: { sub?: unknown } | null;
    }> | null;
  } | null,
): string | null {
  const identity = user?.identities?.find((i) => i.provider === "apple");
  if (!identity) return null;
  const sub = identity.identity_data?.sub;
  if (typeof sub === "string" && sub) return sub;
  return identity.id ?? null;
}

/** The extra line in the Delete Account dialog for an account that signs in
 *  with Apple: none in the app (Apple's sheet finishes it); elsewhere the person
 *  removes phyto from their Apple Account themselves. */
/** Shown when the person closes Apple's sheet during Delete Account. */
export const APPLE_CONFIRM_NEEDED = "Confirm with Apple to finish.";

export function appleDeleteNote(apple: boolean, canAskApple: boolean): string | null {
  // In the app Apple's sheet simply follows Delete forever (his call, Nov 23:
  // no line for it); only browsers need telling.
  if (!apple || canAskApple) return null;
  return "To finish, remove phyto under Sign in with Apple in your Apple Account settings.";
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  // Secrets pasted through a terminal can arrive with literal "\n"s.
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** The client secret Apple's token and revoke endpoints want: an ES256 JWT
 *  signed with the .p8 key, valid for five minutes. */
export async function appleClientSecret(o: {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  clientId: string;
  nowS?: number;
}): Promise<string> {
  const now = o.nowS ?? Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "ES256", kid: o.keyId, typ: "JWT" });
  const payload = base64urlJson({
    iss: o.teamId,
    iat: now,
    exp: now + 300,
    aud: APPLE_AUD,
    sub: o.clientId,
  });
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(o.privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto's ECDSA signature is already JOSE's raw r || s.
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64url(new Uint8Array(sig))}`;
}

/** The `sub` claim of a JWT (read only: it came straight from Apple over TLS). */
export function jwtSubject(jwt: string): string | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

export type RevokeResult =
  | "revoked"
  | "not-configured"
  | "exchange-failed"
  | "other-apple-id"
  | "revoke-failed";

/** Trades the sheet's authorization code for Apple's refresh token and
 *  revokes it. Only revokes when the code belongs to the account's own Apple
 *  ID (`expectedSub`). Never throws: deletion goes ahead whatever this says. */
export async function revokeAppleSignIn(o: {
  code: string;
  expectedSub: string | null;
  keyId: string | undefined;
  privateKeyPem: string | undefined;
  fetchFn?: typeof fetch;
  nowS?: number;
}): Promise<RevokeResult> {
  if (!o.keyId || !o.privateKeyPem) return "not-configured";
  const doFetch = o.fetchFn ?? fetch;
  try {
    const clientSecret = await appleClientSecret({
      teamId: APPLE_TEAM_ID,
      keyId: o.keyId,
      privateKeyPem: o.privateKeyPem,
      clientId: APPLE_APP_CLIENT_ID,
      nowS: o.nowS,
    });
    const tokenRes = await doFetch(`${APPLE_AUD}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: APPLE_APP_CLIENT_ID,
        client_secret: clientSecret,
        code: o.code,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) return "exchange-failed";
    const tokens = (await tokenRes.json()) as {
      refresh_token?: string;
      access_token?: string;
      id_token?: string;
    };
    const sub = tokens.id_token ? jwtSubject(tokens.id_token) : null;
    if (!o.expectedSub || sub !== o.expectedSub) return "other-apple-id";
    const token = tokens.refresh_token ?? tokens.access_token;
    if (!token) return "exchange-failed";
    const revokeRes = await doFetch(`${APPLE_AUD}/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: APPLE_APP_CLIENT_ID,
        client_secret: clientSecret,
        token,
        token_type_hint: tokens.refresh_token ? "refresh_token" : "access_token",
      }).toString(),
    });
    return revokeRes.ok ? "revoked" : "revoke-failed";
  } catch {
    return "revoke-failed";
  }
}
