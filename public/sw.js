/* phyto app offline cache (registered only inside the phyto iOS / Android
 * app: lib/native-app.ts registerAppServiceWorker).
 *
 * - /assets/* and /fonts/* (hashed or fixed): cache first. The full list comes
 *   from /sw-assets.json (written by the build), fetched on install, on
 *   activate and on every app launch ("phyto-sw-refresh"), so every screen's
 *   code is on the device after the first launch, and old builds' files are
 *   dropped. The intro clips are fetched first (the intro is the first screen
 *   of a new install). Video asks for byte ranges, so a cached file answers
 *   them with 206 slices.
 * - Pages ("/" and the TV screen "/output"): network first (6 s), the last
 *   good copy offline. The library itself lives in the device's database, so
 *   it opens offline.
 * - Song catalogue JSON: network first, the cached copy offline.
 * - Pictures in the library (our R2 media, YouTube posters): the page sends
 *   the list ("phyto-sw-pictures", lib/offline-pictures.ts); each is kept
 *   once (R2 read through /api/media/raw, which can be checked for errors)
 *   and pictures no set uses are dropped. Drawn cache first. Videos are not
 *   kept.
 * - Any other page offline: a small offline page with Try again (and Open
 *   your library when the home page is cached).
 * Everything else (Supabase, Bible lookups, YouTube, /api) goes straight to
 * the network, untouched.
 */

const CACHE = "phyto-app-v1";
const PICTURES = "phyto-pictures-v1";
const SHELL = "/";
const PAGES = [SHELL, "/output"];
const DATA = ["/songs-en.json", "/psalms-seedbed.json"];
const MEDIA_HOSTS = ["media.phyto.live", "media.phytoexp.live"];
const PICTURE_HOSTS = [...MEDIA_HOSTS, "i.ytimg.com"];
const PICTURES_MESSAGE = "phyto-sw-pictures";

self.addEventListener("install", (event) => {
  event.waitUntil(precache().catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Activation must stay quick: while it runs, the page's requests wait, so
  // waiting here for a new build's downloads (the intro clips alone are
  // ~10 MB) held the app on its blue launch screen. Take over, then fill
  // the cache in the background (each launch's "phyto-sw-refresh" resumes it).
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE && key !== PICTURES) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
  precache().catch(() => {});
});

self.addEventListener("message", (event) => {
  if (event.data === "phyto-sw-refresh") event.waitUntil(precache().catch(() => {}));
  else if (event.data && event.data.type === PICTURES_MESSAGE && Array.isArray(event.data.urls)) {
    event.waitUntil(keepPictures(event.data.urls).catch(() => {}));
  }
});

/** The intro's clips and posters first, then everything else in order. */
function precacheOrder(paths) {
  const intro = (p) => /^\/assets\/intro-/.test(p);
  return [...paths.filter(intro), ...paths.filter((p) => !intro(p))];
}

async function precache() {
  const res = await fetch("/sw-assets.json", { cache: "no-store" });
  if (!res.ok) return;
  const { files } = await res.json();
  const cache = await caches.open(CACHE);
  const wanted = precacheOrder([...files, ...DATA]).map(
    (f) => new URL(f, self.location.origin).href,
  );
  const keep = new Set(wanted);
  const have = new Set((await cache.keys()).map((r) => r.url));
  for (const page of PAGES) {
    try {
      const r = await fetch(page, { cache: "no-store" });
      if (r.ok) await cache.put(page, r);
    } catch {
      // Offline: keep the copy we have.
    }
  }
  for (const url of wanted) {
    if (have.has(url)) continue;
    try {
      const r = await fetch(url);
      if (r.ok) await cache.put(url, r);
    } catch {
      // Try again on the next launch.
    }
  }
  // Old builds' hashed files.
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/assets/") && !keep.has(req.url)) await cache.delete(req);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Keeping a copy never holds up the answer: the page gets the response at
  // once and the copy is stored in the background.
  const keep = (cache, key, res) => event.waitUntil(cache.put(key, res).catch(() => {}));
  // Whatever goes wrong in here, the page still gets the network's answer.
  const answer = (p) => event.respondWith(p.catch(() => fetch(req)));
  if (url.origin !== self.location.origin) {
    if (isPictureRequest(req, url)) answer(picture(req, url));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(navigate(req, url, keep));
  } else if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    answer(cacheFirst(req, keep));
  } else if (DATA.includes(url.pathname)) {
    answer(networkFirst(req, keep));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const noKeep = (cache, key, res) => cache.put(key, res).catch(() => {});

async function navigate(req, url, keep = noKeep) {
  const cache = await caches.open(CACHE);
  const page = PAGES.includes(url.pathname) ? url.pathname : null;
  try {
    const res = await withTimeout(fetch(req), 6000);
    if (res.ok && page) keep(cache, page, res.clone());
    return res;
  } catch {
    const copy = page ? await cache.match(page) : undefined;
    if (copy) return copy;
    return offlinePage(!!(await cache.match(SHELL)));
  }
}

async function cacheFirst(req, keep = noKeep) {
  const cache = await caches.open(CACHE);
  const range = req.headers.get("range");
  const hit = await cache.match(req.url);
  if (hit) return range ? rangeResponse(hit, range) : hit;
  // A piece of a file that isn't kept yet (a video starting before the
  // precache reached it): straight from the network. A 206 can't be cached.
  if (range) return fetch(req);
  const res = await fetch(req);
  if (res.status === 200) keep(cache, req, res.clone());
  return res;
}

/** Answers a byte-range request (video) from a whole cached file. */
async function rangeResponse(res, header) {
  const blob = await res.blob();
  const size = blob.size;
  const type = res.headers.get("Content-Type") || "application/octet-stream";
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) {
    return new Response(blob, { status: 200, headers: { "Content-Type": type } });
  }
  let start;
  let end;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": type,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

/** A picture drawn by the page (img, CSS background) from a kept host. */
function isPictureRequest(req, url) {
  return (
    req.destination === "image" && url.protocol === "https:" && PICTURE_HOSTS.includes(url.hostname)
  );
}

async function picture(req, url) {
  const cache = await caches.open(PICTURES);
  const hit = await cache.match(url.href);
  if (hit) return hit;
  return fetch(req);
}

/** Where to read a picture so the answer can be checked: our R2 hosts send
 *  no CORS headers, so they go through the same-origin /api/media/raw. */
function pictureSource(href) {
  const u = new URL(href);
  if (MEDIA_HOSTS.includes(u.hostname)) return `/api/media/raw?u=${encodeURIComponent(href)}`;
  return href;
}

let pictureRun = Promise.resolve();

/** Keep exactly these pictures: fetch the missing ones, drop the rest. Runs
 *  one list at a time. */
function keepPictures(urls) {
  pictureRun = pictureRun.then(() => syncPictures(urls)).catch(() => {});
  return pictureRun;
}

async function syncPictures(urls) {
  const wanted = new Set(
    urls.filter((u) => {
      try {
        const p = new URL(u);
        return p.protocol === "https:" && PICTURE_HOSTS.includes(p.hostname);
      } catch {
        return false;
      }
    }),
  );
  const cache = await caches.open(PICTURES);
  const have = new Set((await cache.keys()).map((r) => r.url));
  for (const href of have) if (!wanted.has(href)) await cache.delete(href);
  for (const href of wanted) {
    if (have.has(href)) continue;
    try {
      const r = await fetch(pictureSource(href), { mode: "cors", credentials: "omit" });
      if (r.status !== 200) continue;
      const type = r.headers.get("Content-Type") || "image/jpeg";
      if (type.startsWith("text/")) continue;
      await cache.put(href, new Response(await r.blob(), { headers: { "Content-Type": type } }));
    } catch {
      // Offline or gone: try again with the next list.
    }
  }
}

async function networkFirst(req, keep = noKeep) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) keep(cache, req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw new Error("offline");
  }
}

function offlinePage(hasShell) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>phyto</title><style>
:root{color-scheme:light dark;--bg:#F5EFEF;--fg:#000}
@media (prefers-color-scheme:dark){:root{--bg:#000;--fg:#F5EFEF}}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg)}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:32px;box-sizing:border-box;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:.05em;text-transform:uppercase}
p{margin:0;max-width:22rem;line-height:1.5}
.row{display:flex;gap:12px}
a,button{font:inherit;letter-spacing:inherit;text-transform:inherit;text-decoration:none;border-radius:999px;padding:10px 20px;border:1px solid var(--fg);color:var(--fg);background:none}
.fill{background:var(--fg);color:var(--bg)}
</style></head><body><script>try{Capacitor.Plugins.SplashScreen.hide()}catch(e){}</script><p>You're offline. Connect to the internet, then try again.</p><div class="row"><button class="fill" onclick="location.reload()">Try again</button>${
    hasShell ? '<a href="/">Open your library</a>' : ""
  }</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
