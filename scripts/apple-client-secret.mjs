#!/usr/bin/env node
/**
 * Makes the "Secret Key" Supabase needs for Sign in with Apple on the website
 * (phone and computer browsers). Apple lets this key last at most 6 months,
 * so run this again before it runs out.
 *
 * Usage: node scripts/apple-client-secret.mjs ~/Downloads/AuthKey_XXXXXXXXXX.p8
 *
 * It asks for the Team ID and the Services ID (the Key ID is read from the
 * file name), then copies the secret to the clipboard for pasting into
 * Supabase. The secret is never printed, and nothing is saved.
 */
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";

const SIX_MONTHS_S = 180 * 24 * 60 * 60;

const keyPath = process.argv[2];
if (!keyPath) {
  console.error("Usage: node scripts/apple-client-secret.mjs <path to AuthKey_XXXXXXXXXX.p8>");
  process.exit(1);
}
const keyId = /AuthKey_([A-Z0-9]{10})\.p8$/i.exec(basename(keyPath))?.[1];
if (!keyId) {
  console.error(
    "The key file should be named AuthKey_<10 letters and numbers>.p8, as Apple names it.",
  );
  process.exit(1);
}
const privateKey = createPrivateKey(readFileSync(keyPath, "utf8"));

const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => {
  process.stdout.write(q);
  const { value } = await lines.next();
  return (value ?? "").trim();
};
const teamId = await ask("Team ID (10 characters, top right of developer.apple.com): ");
const servicesId = await ask("Services ID (e.g. live.phyto.web): ");
rl.close();
if (!/^[A-Z0-9]{10}$/.test(teamId) || !servicesId) {
  console.error("That Team ID or Services ID doesn't look right. Nothing was made.");
  process.exit(1);
}

const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const exp = now + SIX_MONTHS_S;
const head = b64({ alg: "ES256", kid: keyId, typ: "JWT" });
const body = b64({ iss: teamId, iat: now, exp, aud: "https://appleid.apple.com", sub: servicesId });
const sig = sign("sha256", Buffer.from(`${head}.${body}`), {
  key: privateKey,
  dsaEncoding: "ieee-p1363",
}).toString("base64url");

execFileSync("pbcopy", { input: `${head}.${body}.${sig}` });
const until = new Date(exp * 1000).toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
console.log(`\nDone: the secret is on your clipboard. It works until ${until}.`);
console.log("Paste it into Supabase's Apple provider, in the Secret Key field.");
