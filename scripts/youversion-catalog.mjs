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
//   src/lib/youversion-book-names.json every Bible's book names -> book id,
//                                     loaded only to read a reference typed in
//                                     a language that isn't English
//
// Re-run it now and then: Bibles YouVersion adds only show up in phyto once
// they're in the snapshot. YouVersion rate-limits the key (a 429 asks for a
// 5-minute pause), so requests go one at a time, a 429 is waited out, and a
// notice already in bible-copyrights.json isn't fetched again: the first run
// takes a while, later ones only fetch the new Bibles.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.VITE_YOUVERSION_APP_KEY;
if (!KEY) throw new Error("Set VITE_YOUVERSION_APP_KEY (in .env, or the environment).");

const API = "https://api.youversion.com";
const CATALOG = "src/lib/youversion-catalog.json";
const NAMES = "src/lib/youversion-names.json";
const COPYRIGHTS = "src/content/bible-copyrights.json";
const BOOK_NAMES = "src/lib/youversion-book-names.json";
// Each Bible's book list is ~200 KB (it carries the whole verse index): what
// phyto keeps of it is cached here, so a re-run only fetches new Bibles.
const BOOKS_CACHE = "node_modules/.cache/youversion-books";
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

console.log("Book names…");
// prettier-ignore
const USFM = ["GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI","1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER","LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP","HAG","ZEC","MAL","MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN","JUD","REV"];
mkdirSync(BOOKS_CACHE, { recursive: true });
// The same normalisation lib/bible.ts matches typed names with.
const norm = (s) => s.normalize("NFC").toLowerCase().replace(/\s+/g, "");
// name -> { book id -> how many Bibles call it that }
const votes = new Map();
const bookLists = new Array(bibles.length);
let next = 0;
let done = 0;
// Four at a time: each list is a ~200 KB download, so the gap between
// requests isn't what takes the time.
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < bibles.length) {
      const i = next++;
      const file = `${BOOKS_CACHE}/${bibles[i].id}.json`;
      if (existsSync(file)) bookLists[i] = JSON.parse(readFileSync(file, "utf8"));
      else {
        try {
          const data = (await get(`/v1/bibles/${bibles[i].id}/books`))?.data ?? [];
          bookLists[i] = data.map((x) => [x.id, x.title ?? "", x.full_title ?? ""]);
          writeFileSync(file, JSON.stringify(bookLists[i]));
        } catch (e) {
          // Some Bibles' book lists fail on YouVersion's side (a lasting 500):
          // left out this time, and not cached, so the next run asks again.
          console.log(`  skipped ${bibles[i].id}: ${e.message}`);
          bookLists[i] = [];
        }
      }
      if (++done % 100 === 0) console.log(`  ${done}/${bibles.length}`);
    }
  }),
);
for (const books of bookLists) {
  for (const [usfm, ...titles] of books) {
    const id = USFM.indexOf(usfm) + 1;
    if (!id) continue;
    for (const t of new Set(titles.map(norm).filter(Boolean))) {
      const v = votes.get(t) ?? new Map();
      v.set(id, (v.get(id) ?? 0) + 1);
      votes.set(t, v);
    }
  }
}
// A name two languages give different books goes to the book most Bibles
// mean by it.
const names = {};
for (const [name, v] of [...votes].sort(([a], [b]) => (a < b ? -1 : 1))) {
  names[name] = [...v].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}
writeFileSync(BOOK_NAMES, JSON.stringify({ generated: today, names }) + "\n");
console.log(`  ${Object.keys(names).length} names`);
