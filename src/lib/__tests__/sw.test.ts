// @vitest-environment node
// The app's offline cache (public/sw.js) is a plain script, so it is loaded
// into a sandbox with stand-ins for the service worker globals.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://phytoexp.live";

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const abs = (k: string | { url: string }) =>
    new URL(typeof k === "string" ? k : k.url, ORIGIN).href;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (k: string) => m.get(abs(k))?.clone(),
      put: async (k: string, r: Response) => void m.set(abs(k), r),
      delete: async (k: string) => m.delete(abs(k)),
      keys: async () => [...m.keys()].map((url) => ({ url })),
    };
  };
  return { stores, api: { open, keys: async () => [...stores.keys()] } };
}

function loadSw(fetchImpl: (input: string, init?: RequestInit) => Promise<Response>) {
  const caches = fakeCaches();
  const sandbox: Record<string, unknown> = {
    self: {
      addEventListener: () => {},
      location: { origin: ORIGIN },
      clients: { claim: async () => {} },
      skipWaiting: () => {},
    },
    caches: caches.api,
    fetch: fetchImpl,
    Response,
    Blob,
    URL,
    setTimeout,
    clearTimeout,
  };
  runInNewContext(readFileSync(resolve(__dirname, "../../../public/sw.js"), "utf8"), sandbox);
  return { sw: sandbox as Record<string, (...a: unknown[]) => Promise<Response>>, caches };
}

describe("offline cache: video ranges", () => {
  const file = () =>
    new Response(new Blob([new Uint8Array(100).map((_, i) => i)]), {
      headers: { "Content-Type": "video/mp4" },
    });

  it("answers a range with a 206 slice", async () => {
    const { sw } = loadSw(async () => new Response(null));
    const res = await sw.rangeResponse(file(), "bytes=10-19");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 10-19/100");
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  it("handles open-ended, suffix and Safari's first probe", async () => {
    const { sw } = loadSw(async () => new Response(null));
    expect((await sw.rangeResponse(file(), "bytes=0-1")).headers.get("Content-Range")).toBe(
      "bytes 0-1/100",
    );
    expect((await sw.rangeResponse(file(), "bytes=90-")).headers.get("Content-Range")).toBe(
      "bytes 90-99/100",
    );
    expect((await sw.rangeResponse(file(), "bytes=-5")).headers.get("Content-Range")).toBe(
      "bytes 95-99/100",
    );
    expect((await sw.rangeResponse(file(), "bytes=50-500")).headers.get("Content-Range")).toBe(
      "bytes 50-99/100",
    );
  });

  it("refuses a range past the end", async () => {
    const { sw } = loadSw(async () => new Response(null));
    const res = await sw.rangeResponse(file(), "bytes=100-");
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */100");
  });
});

describe("offline cache: precache order", () => {
  it("fetches the intro first", () => {
    const { sw } = loadSw(async () => new Response(null));
    const order = sw.precacheOrder([
      "/assets/index-a.js",
      "/assets/intro-set-b.mp4",
      "/fonts/x.ttf",
      "/assets/intro-set-poster-c.webp",
    ]) as unknown as string[];
    expect(order).toEqual([
      "/assets/intro-set-b.mp4",
      "/assets/intro-set-poster-c.webp",
      "/assets/index-a.js",
      "/fonts/x.ttf",
    ]);
  });
});

describe("offline cache: pages", () => {
  it("takes over at once on activate, without waiting for the downloads", async () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    const caches = fakeCaches();
    let claimed = false;
    const sandbox: Record<string, unknown> = {
      self: {
        addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
        location: { origin: ORIGIN },
        clients: { claim: async () => void (claimed = true) },
        skipWaiting: () => {},
      },
      caches: caches.api,
      // The network never answers: activation must not wait for it.
      fetch: () => new Promise(() => {}),
      Response,
      Blob,
      URL,
      setTimeout,
      clearTimeout,
    };
    runInNewContext(readFileSync(resolve(__dirname, "../../../public/sw.js"), "utf8"), sandbox);
    let waited: Promise<unknown> | undefined;
    listeners.activate({ waitUntil: (p: Promise<unknown>) => (waited = p) });
    await waited;
    expect(claimed).toBe(true);
  });

  it("answers the page before its copy is stored", async () => {
    let stored = false;
    const { sw } = loadSw(async () => new Response("<p>home</p>"));
    const keep = () => {
      // A slow store (a streamed page) must not hold the answer.
      setTimeout(() => (stored = true), 50);
    };
    const res = await sw.navigate({ url: `${ORIGIN}/` }, new URL(`${ORIGIN}/`), keep);
    expect(await res.text()).toBe("<p>home</p>");
    expect(stored).toBe(false);
  });
  it("keeps the TV screen and serves it offline", async () => {
    let online = true;
    const { sw } = loadSw(async () => {
      if (!online) throw new Error("offline");
      return new Response("<p>tv</p>", { headers: { "Content-Type": "text/html" } });
    });
    const req = { url: `${ORIGIN}/output` };
    await sw.navigate(req, new URL(req.url));
    online = false;
    const res = await sw.navigate(req, new URL(req.url));
    expect(await res.text()).toBe("<p>tv</p>");
  });

  it("never serves a kept page at another path", async () => {
    let online = true;
    const { sw } = loadSw(async () => {
      if (!online) throw new Error("offline");
      return new Response("<p>home</p>");
    });
    await sw.navigate({ url: `${ORIGIN}/` }, new URL(`${ORIGIN}/`));
    online = false;
    const res = await sw.navigate({ url: `${ORIGIN}/present` }, new URL(`${ORIGIN}/present`));
    expect(await res.text()).toContain("You're offline");
  });
});

describe("offline cache: library pictures", () => {
  const R2 = "https://media.phyto.live/u/a.jpg";
  const YT = "https://i.ytimg.com/vi/abc/hqdefault.jpg";

  it("keeps R2 pictures through the same-origin reader and drops unused ones", async () => {
    const asked: string[] = [];
    const { sw, caches } = loadSw(async (input) => {
      asked.push(String(input));
      return new Response(new Blob(["x"]), { headers: { "Content-Type": "image/jpeg" } });
    });
    await sw.keepPictures([R2, YT, "https://evil.com/x.jpg", "data:image/png;base64,AA"]);
    expect(asked).toEqual([`/api/media/raw?u=${encodeURIComponent(R2)}`, YT]);
    const kept = caches.stores.get("phyto-pictures-v1")!;
    expect([...kept.keys()].sort()).toEqual([R2, YT].sort());

    await sw.keepPictures([YT]);
    expect([...kept.keys()]).toEqual([YT]);
  });

  it("never keeps an error answer", async () => {
    const { sw, caches } = loadSw(async () => new Response("Not found", { status: 404 }));
    await sw.keepPictures([R2]);
    expect(caches.stores.get("phyto-pictures-v1")!.size).toBe(0);
  });

  it("draws a kept picture without the network", async () => {
    let calls = 0;
    const { sw } = loadSw(async () => {
      calls++;
      return new Response(new Blob(["pic"]), { headers: { "Content-Type": "image/png" } });
    });
    await sw.keepPictures([R2]);
    calls = 0;
    const res = await sw.picture({ url: R2 }, new URL(R2));
    expect(await res.text()).toBe("pic");
    expect(calls).toBe(0);
  });

  it("only takes over picture requests from kept hosts", () => {
    const { sw } = loadSw(async () => new Response(null));
    const is = (dest: string, url: string) =>
      sw.isPictureRequest({ destination: dest }, new URL(url)) as unknown as boolean;
    expect(is("image", R2)).toBe(true);
    expect(is("image", YT)).toBe(true);
    expect(is("video", "https://media.phyto.live/u/v.mp4")).toBe(false);
    expect(is("", R2)).toBe(false);
    expect(is("image", "https://example.com/a.jpg")).toBe(false);
  });
});
