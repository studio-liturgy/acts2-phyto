#!/usr/bin/env node
/**
 * Gives the phyto server the Sign in with Apple key, so Delete Account can
 * revoke an account's Apple sign-in (lib/apple-revoke.ts). Stores two Worker
 * secrets: APPLE_KEY_ID (read from the file name) and APPLE_PRIVATE_KEY (the
 * file's contents). The key is never printed.
 *
 * Usage:
 *   node scripts/apple-revoke-secret.mjs ~/Downloads/AuthKey_XXXXXXXXXX.p8 test
 *   node scripts/apple-revoke-secret.mjs ~/Downloads/AuthKey_XXXXXXXXXX.p8 prod
 * Add --dry-run to check the key without storing anything.
 */
import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [keyPath, target] = args.filter((a) => a !== "--dry-run");

if (!keyPath || (target !== "test" && target !== "prod")) {
  console.error("Usage: node scripts/apple-revoke-secret.mjs <AuthKey_XXXXXXXXXX.p8> <test|prod>");
  process.exit(1);
}
const keyId = /AuthKey_([A-Z0-9]{10})\.p8$/i.exec(basename(keyPath))?.[1]?.toUpperCase();
if (!keyId) {
  console.error(
    `The key file should be named AuthKey_<10 letters and numbers>.p8, as Apple names it. This one is "${basename(keyPath)}".`,
  );
  process.exit(1);
}
let pem;
try {
  pem = readFileSync(keyPath, "utf8").trim();
  const k = createPrivateKey(pem);
  if (k.asymmetricKeyType !== "ec") throw new Error("not an EC key");
} catch (e) {
  console.error(`Couldn't read a Sign in with Apple key from ${keyPath} (${e.message}).`);
  process.exit(1);
}

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const npx = join(dirname(process.execPath), "npx");
const envArgs = target === "test" ? ["--env", "test"] : [];
const worker = target === "test" ? "acts2-phyto-test (phytoexp.live)" : "acts2-phyto (phyto.live)";

if (dryRun) {
  console.log(
    `Key ${keyId} reads fine. Would store APPLE_KEY_ID and APPLE_PRIVATE_KEY on ${worker}.`,
  );
  process.exit(0);
}

const put = (name, value) =>
  execFileSync(npx, ["wrangler", "secret", "put", name, ...envArgs], {
    cwd: repo,
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    env: {
      ...process.env,
      PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
      NODE_OPTIONS: "--network-family-autoselection-attempt-timeout=2000",
    },
  });

try {
  put("APPLE_KEY_ID", keyId);
  put("APPLE_PRIVATE_KEY", pem);
} catch {
  console.error(
    "\nwrangler didn't finish. Copy the lines above into the chat (they hold no secret).",
  );
  process.exit(1);
}
console.log(`\nDone: the Apple key ${keyId} is stored on ${worker}.`);
