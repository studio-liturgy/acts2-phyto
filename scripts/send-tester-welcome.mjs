#!/usr/bin/env node
// Send the "You're in" tester-welcome email to a list of addresses via
// Resend, one send per address (no personalization, no [name]).
//
// Usage:
//   node scripts/send-tester-welcome.mjs emails.txt           # dry run (default)
//   node scripts/send-tester-welcome.mjs emails.txt --send    # actually sends
//   echo "a@x.com\nb@y.com" | node scripts/send-tester-welcome.mjs - --send
//
// Reads RESEND_API_KEY / RESEND_FROM from .dev.vars unless already set in
// the environment. Prints the phytoexp_testers INSERT for Valiant to run
// himself (this script never writes to Supabase).

import { readFileSync } from "node:fs";
import { Resend } from "resend";

function loadDevVars() {
  try {
    const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  } catch {}
}

function parseEmails(text) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set();
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const e = raw.trim().toLowerCase();
    if (!e || !re.test(e)) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

async function main() {
  loadDevVars();
  const args = process.argv.slice(2);
  const send = args.includes("--send");
  const srcArg = args.find((a) => !a.startsWith("--"));
  if (!srcArg) {
    console.error("Usage: send-tester-welcome.mjs <emails-file|-> [--send]");
    process.exit(1);
  }
  const raw = srcArg === "-" ? readFileSync(0, "utf8") : readFileSync(srcArg, "utf8");
  const emails = parseEmails(raw);
  if (emails.length === 0) {
    console.error("No valid email addresses found.");
    process.exit(1);
  }

  const html = readFileSync(
    new URL("../email-templates/tester-welcome.html", import.meta.url),
    "utf8",
  );
  const from = process.env.RESEND_FROM || "phyto <hello@phyto.live>";

  console.log(`${emails.length} address(es):\n  ${emails.join("\n  ")}\n`);
  console.log("phytoexp_testers SQL (run this yourself in the Supabase SQL editor):\n");
  console.log(
    "insert into public.phytoexp_testers (email) values\n  " +
      emails.map((e) => `('${e.replace(/'/g, "''")}')`).join(",\n  ") +
      "\non conflict (email) do nothing;\n",
  );

  if (!send) {
    console.log("DRY RUN: no email sent. Re-run with --send once the SQL above has been run.");
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set (checked .dev.vars and env).");
    process.exit(1);
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  // Same fix as src/routes/api/share/invite.ts and groups/invite.ts: Apple
  // Mail's Data Detectors scan the rendered text itself, so an invisible
  // word joiner after the "@" and before each "." breaks the pattern
  // (the bare domain would otherwise still be picked up as a web link)
  // without showing. Kept underlined here (his call for this email).
  const emailHtml = (addr) =>
    `<span style="color:inherit;text-decoration:underline;white-space:nowrap;">${addr.replace(/@/g, "@&#8288;").replace(/\./g, "&#8288;.")}</span>`;
  for (const email of emails) {
    const body = html.replaceAll("[email]", emailHtml(email));
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: "You're in: testing phyto on mobile",
      html: body,
    });
    console.log(error ? `FAIL ${email}: ${error.message}` : `sent ${email}`);
    await new Promise((r) => setTimeout(r, 600));
  }
}

main();
