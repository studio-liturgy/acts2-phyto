/* phyto app offline cache (registered only inside the phyto iOS / Android
 * app: lib/native-app.ts registerAppServiceWorker).
 *
 * - /assets/* and /fonts/* (hashed or fixed): cache first. The full list comes
 *   from /sw-assets.json (written by the build), fetched on install, on
 *   activate and on every app launch ("phyto-sw-refresh"), so every screen's
 *   code is on the device after the first launch, and old builds' files are
 *   dropped.
 * - The home page ("/"): network first (6 s), the last good copy offline.
 *   The library itself lives in the device's database, so it opens offline.
 * - Song catalogue JSON: network first, the cached copy offline.
 * - Any other page offline: a small offline page with Try again (and Open
 *   your library when the home page is cached).
 * Everything else (Supabase, Bible lookups, YouTube, /api) goes straight to
 * the network, untouched.
 */

const CACHE = "phyto-app-v1";
const SHELL = "/";
const DATA = ["/songs-en.json", "/psalms-seedbed.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(precache().catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await precache().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "phyto-sw-refresh") event.waitUntil(precache().catch(() => {}));
});

async function precache() {
  const res = await fetch("/sw-assets.json", { cache: "no-store" });
  if (!res.ok) return;
  const { files } = await res.json();
  const cache = await caches.open(CACHE);
  const wanted = [...files, ...DATA].map((f) => new URL(f, self.location.origin).href);
  const keep = new Set(wanted);
  const have = new Set((await cache.keys()).map((r) => r.url));
  try {
    const shell = await fetch(SHELL, { cache: "no-store" });
    if (shell.ok) await cache.put(SHELL, shell);
  } catch {
    // Offline: keep the copy we have.
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
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(navigate(req, url));
  } else if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(cacheFirst(req));
  } else if (DATA.includes(url.pathname)) {
    event.respondWith(networkFirst(req));
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

async function navigate(req, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), 6000);
    if (res.ok && url.pathname === SHELL) await cache.put(SHELL, res.clone());
    return res;
  } catch {
    const shell = await cache.match(SHELL);
    if (url.pathname === SHELL && shell) return shell;
    return offlinePage(!!shell);
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
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
