import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalVersion,
  fetchScripture,
  parseReferenceLocalized,
  splitRefLabel,
  withVersionCode,
} from "@/lib/bible";
import { bookNameFromReference, parseYvHtml } from "@/lib/youversion";

// Trimmed from real responses (NIV John 3, NIV Psalm 23, KLB Genesis 1).
const JOHN_3 =
  '<div><div class="p"><span class="yv-v" v="16"></span><span class="yv-vlbl">16</span>For God so loved the world that he gave his one and only Son. <span class="yv-v" v="17"></span><span class="yv-vlbl">17</span>For God did not send his Son into the world to condemn the world, <span class="wj">but to save</span> the world through him. </div></div>';
const PSALM_23 =
  '<div><div class="d">A psalm of David.</div><div class="q1"><span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>The <span class="nd">Lord</span> is my shepherd, I lack nothing.</div><div class="q2"><span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>He makes me lie down in green pastures,</div><div class="q1">he leads me beside quiet waters,</div></div>';
const MERGED =
  '<div><div class="p"><span class="yv-v" v="5"></span><span class="yv-vlbl">5</span>빛을 낮이라 부르시고</div><div class="p"><span class="yv-v" ev="7" v="6"></span><span class="yv-vlbl">6-7</span>하나님이 공간을 만들어</div><div class="p"><span class="yv-v" v="8"></span><span class="yv-vlbl">8</span>그 공간을 하늘이라고</div></div>';

describe("parseYvHtml", () => {
  it("splits a chapter into verses at YouVersion's markers, labels dropped", () => {
    expect(parseYvHtml(JOHN_3, false)).toEqual([
      { verse: 16, text: "For God so loved the world that he gave his one and only Son." },
      {
        verse: 17,
        text: "For God did not send his Son into the world to condemn the world, but to save the world through him.",
      },
    ]);
  });

  it("drops a psalm's title and keeps poetry lines only when asked", () => {
    expect(parseYvHtml(PSALM_23, false)).toEqual([
      { verse: 1, text: "The Lord is my shepherd, I lack nothing." },
      {
        verse: 2,
        text: "He makes me lie down in green pastures, he leads me beside quiet waters,",
      },
    ]);
    expect(parseYvHtml(PSALM_23, true)[1].text).toBe(
      "He makes me lie down in green pastures,\nhe leads me beside quiet waters,",
    );
  });

  it("numbers a merged verse by its first, and skips a verse with no text", () => {
    expect(parseYvHtml(MERGED, false)[1]).toEqual({
      verse: 6,
      endVerse: 7,
      text: "하나님이 공간을 만들어",
    });
    const omitted =
      '<div><div class="p"><span class="yv-v" v="20"></span>Nothing is impossible. <span class="yv-v" v="21"></span><span class="yv-vlbl">[21]</span></div></div>';
    expect(parseYvHtml(omitted, false).map((v) => v.verse)).toEqual([20]);
  });

  it("decodes entities", () => {
    const html = '<div><span class="yv-v" v="1"></span>Faith &amp; hope &#8212; love</div>';
    expect(parseYvHtml(html, false)[0].text).toBe("Faith & hope — love");
  });
});

it("reads the book name off a passage's reference", () => {
  expect(bookNameFromReference("요한복음 3:16")).toBe("요한복음");
  expect(bookNameFromReference("Psalms 23")).toBe("Psalms");
  expect(bookNameFromReference("1 John 4:7-8")).toBe("1 John");
  expect(bookNameFromReference("إنجيل يوحنا ‎16:3")).toBe("إنجيل يوحنا");
});

describe("version labels", () => {
  it("strip and write YouVersion abbreviations, several words included", () => {
    expect(splitRefLabel("John 3:16 NIV")).toEqual({ ref: "John 3:16", code: "yv:111" });
    expect(splitRefLabel("John 3:16 NASB1995")).toEqual({ ref: "John 3:16", code: "yv:100" });
    expect(splitRefLabel("John 3:16 ESV")).toEqual({ ref: "John 3:16", code: "ESV" });
    expect(splitRefLabel("يوحنا 3:16 ت ع م")).toEqual({ ref: "يوحنا 3:16", code: "yv:195" });
    expect(withVersionCode("John 3:16 ESV", "yv:111", true)).toBe("John 3:16 NIV");
  });

  it("only count after a chapter or verse number", () => {
    expect(splitRefLabel("Sunday NIV")).toEqual({ ref: "Sunday NIV" });
  });

  it("treat a bolls code YouVersion took over as YouVersion's", () => {
    expect(canonicalVersion("NIV")).toBe("yv:111");
    expect(canonicalVersion("NAV")).toBe("yv:101");
    expect(canonicalVersion("ESV")).toBe("ESV");
  });
});

describe("fetchScripture", () => {
  const calls: { url: string; key?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("VITE_YOUVERSION_APP_KEY", "test-app-key");
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        key: (init?.headers as Record<string, string> | undefined)?.["X-YVP-App-Key"],
      });
      if (url.includes("api.youversion.com")) {
        const chapter = /passages\/JHN\.(\d+)/.exec(url)?.[1];
        return {
          ok: true,
          status: 200,
          json: async () => ({ content: JOHN_3, reference: `John ${chapter}` }),
        };
      }
      if (url.includes("get-books")) {
        return { ok: true, status: 200, json: async () => [{ bookid: 43, name: "John" }] };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [{ verse: 16, text: "For God so loved the world (ESV)." }],
      };
    }) as unknown as typeof fetch;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reads a YouVersion Bible from YouVersion, with the app key", async () => {
    const r = await fetchScripture("John 3:16", "yv:111");
    expect(r.reference).toBe("John 3:16");
    expect(r.verses).toEqual([
      {
        verse: 16,
        chapter: 3,
        text: "For God so loved the world that he gave his one and only Son.",
      },
    ]);
    expect(calls).toEqual([
      {
        url: "https://api.youversion.com/v1/bibles/111/passages/JHN.3?format=html",
        key: "test-app-key",
      },
    ]);
  });

  it("reads a set's old bolls NIV from YouVersion too", async () => {
    // (John 3 is cached from the test above: chapters are fetched once.)
    await fetchScripture("John 6:17", "NIV");
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.youversion.com/v1/bibles/111/passages/JHN.6?format=html",
    ]);
  });

  it("fetches each chapter of a cross-chapter range, keeping the verses in range", async () => {
    const r = await fetchScripture("John 4:17-5:16", "yv:1588");
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.youversion.com/v1/bibles/1588/passages/JHN.4?format=html",
      "https://api.youversion.com/v1/bibles/1588/passages/JHN.5?format=html",
    ]);
    expect(r.verses.map((v) => `${v.chapter}:${v.verse}`)).toEqual(["4:17", "5:16"]);
  });

  it("reads a version only bolls has from bolls", async () => {
    const r = await fetchScripture("John 3:16", "ESV");
    expect(r.verses[0].text).toBe("For God so loved the world (ESV).");
    expect(calls.every((c) => c.url.startsWith("https://bolls.life/"))).toBe(true);
  });

  it("says so when YouVersion asks for a pause", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 429 })) as unknown as typeof fetch;
    await expect(fetchScripture("John 2:1", "yv:3034")).rejects.toThrow(/busy/);
  });
});

it("resolves a book typed in a YouVersion Bible's language from its book names", async () => {
  vi.stubEnv("VITE_YOUVERSION_APP_KEY", "test-app-key");
  global.fetch = vi.fn(async (input: RequestInfo | URL) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(input).includes("/books")
        ? { data: [{ id: "JHN", title: "요한복음", full_title: "요한복음", abbreviation: "요" }] }
        : [],
  })) as unknown as typeof fetch;
  expect(await parseReferenceLocalized("요한복음 3:16", ["yv:86"])).toMatchObject({ bookId: 43 });
  // The short form only when typed exactly.
  expect(await parseReferenceLocalized("요 3:16", ["yv:86"])).toMatchObject({ bookId: 43 });
  vi.unstubAllEnvs();
});
