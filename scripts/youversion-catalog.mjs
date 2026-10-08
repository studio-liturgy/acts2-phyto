// Snapshot of the YouVersion Platform catalog: every Bible this app key can
// read, the languages they're in, and each Bible's copyright notice.
//
//   bun run youversion:catalog      (reads VITE_YOUVERSION_APP_KEY from .env)
//
// Writes:
//   src/lib/youversion-catalog.json   each Bible's id, language tag and
//                                     abbreviation: small, in the main bundle
//                                     (labels and typography need it at once)
//   src/lib/youversion-names.json     titles and language names, loaded when
//                                     a version picker or the Terms page opens
//   src/content/bible-copyrights.json the notices, listed on the Terms pages
//
// Re-run it now and then: Bibles YouVersion adds only show up in phyto once
// they're in the snapshot. YouVersion rate-limits the key (a 429 asks for a
// 5-minute pause), so requests go one at a time, a 429 is waited out, and a
// notice already in bible-copyrights.json isn't fetched again: the first run
// takes a while, later ones only fetch the new Bibles.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.VITE_YOUVERSION_APP_KEY;
if (!KEY) throw new Error("Set VITE_YOUVERSION_APP_KEY (in .env, or the environment).");

const API = "https://api.youversion.com";
const CATALOG = "src/lib/youversion-catalog.json";
const NAMES = "src/lib/youversion-names.json";
const COPYRIGHTS = "src/content/bible-copyrights.json";
const GAP_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    for (const x of [v].flat()) url.searchParams.append(k, String(x));
  }
  for (let attempt = 0; ; attempt++) {
    await sleep(GAP_MS);
    // A dropped connection is retried like a 5xx.
    const res = await fetch(url, { headers: { "X-YVP-App-Key": KEY } }).catch((e) => e);
    if (res instanceof Response && res.ok) return res.json();
    if (res instanceof Response && res.status === 404) return null;
    if (res instanceof Response && res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 300;
      console.log(`  rate-limited: waiting ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    if (attempt >= 5) throw res instanceof Response ? new Error(`${res.status} ${url}`) : res;
    await sleep(1000 * 2 ** attempt);
  }
}

/** Every page of a collection endpoint. */
async function all(path, params) {
  const out = [];
  for (let token; ; ) {
    const page = await get(path, {
      ...params,
      page_size: 99,
      ...(token ? { page_token: token } : {}),
    });
    out.push(...(page?.data ?? []));
    token = page?.next_page_token;
    if (!token) return out;
  }
}

const today = new Date().toISOString().slice(0, 10);

console.log("Bibles…");
const bibles = (await all("/v1/bibles", { "language_ranges[]": "*" })).sort((a, b) => a.id - b.id);
console.log(`  ${bibles.length} Bibles`);

console.log("Languages…");
const tags = new Set(bibles.map((b) => b.language_tag));
const languages = {};
for (const l of await all("/v1/languages")) {
  if (tags.has(l.id)) languages[l.id] = l.display_names?.en ?? l.id;
}
for (const tag of [...tags].sort()) {
  if (languages[tag]) continue;
  const l = await get(`/v1/languages/${encodeURIComponent(tag)}`);
  languages[tag] = l?.display_names?.en ?? tag;
}

// [id, language tag, abbreviation]
const rows = bibles.map((b) => [b.id, b.language_tag, b.localized_abbreviation || b.abbreviation]);
writeFileSync(CATALOG, JSON.stringify({ generated: today, bibles: rows }) + "\n");
// id -> [title in its language, English title ("" when the same)]
const titles = {};
for (const b of bibles) {
  const title = b.localized_title || b.title;
  titles[b.id] = [title, b.title === title ? "" : b.title];
}
writeFileSync(NAMES, JSON.stringify({ generated: today, titles, languages }) + "\n");
console.log(`  wrote ${rows.length} Bibles in ${tags.size} languages`);

console.log("Copyright notices…");
// "" marks a Bible without a notice (public domain), so it isn't asked again.
const previous = existsSync(COPYRIGHTS)
  ? JSON.parse(readFileSync(COPYRIGHTS, "utf8")).copyrights
  : {};
const copyrights = {};
for (const b of bibles) if (b.id in previous) copyrights[b.id] = previous[b.id];
const save = () =>
  writeFileSync(COPYRIGHTS, JSON.stringify({ generated: today, copyrights }) + "\n");
const missing = bibles.filter((b) => !(b.id in copyrights));
console.log(`  ${missing.length} to fetch`);
for (const [i, b] of missing.entries()) {
  const detail = await get(`/v1/bibles/${b.id}`);
  copyrights[b.id] = detail?.copyright?.trim() ?? "";
  if ((i + 1) % 50 === 0) {
    save();
    console.log(`  ${i + 1}/${missing.length}`);
  }
}
save();
console.log(`  ${Object.values(copyrights).filter(Boolean).length} notices`);
