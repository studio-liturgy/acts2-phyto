import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseReference, parseReferenceLocalized } from "@/lib/bible";

describe("parseReference (English book names)", () => {
  it("parses a single verse", () => {
    expect(parseReference("John 3:16")).toMatchObject({
      bookId: 43,
      startChapter: 3,
      startVerse: 16,
      endVerse: 16,
    });
  });

  it("parses a verse range", () => {
    expect(parseReference("John 3:16-18")).toMatchObject({ startVerse: 16, endVerse: 18 });
  });

  it("parses a whole chapter", () => {
    expect(parseReference("John 3")).toMatchObject({
      startChapter: 3,
      wholeChapter: true,
      endVerse: 999,
    });
  });

  it("returns null for something that isn't a reference", () => {
    expect(parseReference("not a reference")).toBeNull();
  });
});

describe("parseReferenceLocalized (references typed in another language)", () => {
  beforeEach(() => {
    // bolls' get-books for the translation: book names in its own language.
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { bookid: 43, name: "約翰福音" },
        { bookid: 19, name: "詩篇" },
      ],
    })) as unknown as typeof fetch;
  });

  it("resolves a book name in the translation's language", async () => {
    // distinct code per test so the module's per-translation cache doesn't bleed
    expect(await parseReferenceLocalized("約翰福音 3:16", ["ZZLOC1"])).toMatchObject({
      bookId: 43,
      startChapter: 3,
      startVerse: 16,
      endVerse: 16,
    });
  });

  it("accepts a full-width colon and no space before the chapter", async () => {
    expect(await parseReferenceLocalized("約翰福音3：16", ["ZZLOC2"])).toMatchObject({
      bookId: 43,
      startChapter: 3,
      startVerse: 16,
    });
  });

  it("parses a range", async () => {
    expect(await parseReferenceLocalized("約翰福音 3:16-18", ["ZZLOC3"])).toMatchObject({
      startVerse: 16,
      endVerse: 18,
    });
  });

  it("returns null when the book name isn't found", async () => {
    expect(await parseReferenceLocalized("未知之書 3:16", ["ZZLOC4"])).toBeNull();
  });
});

describe("parseReferenceLocalized fuzzy matching (real book-name variations)", () => {
  beforeEach(() => {
    // Mirrors what bolls actually returns: John's Gospel carries a suffix
    // ("요한복음서") and the same stem prefixes the epistles and Revelation, so a
    // bare "요한복음" / "ヨハネ" must still land on the Gospel.
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { bookid: 43, name: "요한복음서" },
        { bookid: 62, name: "요한1서" },
        { bookid: 66, name: "요한계시록" },
        { bookid: 46, name: "고린도전서" },
      ],
    })) as unknown as typeof fetch;
  });

  it("matches a typed name that is a prefix of the stored name", async () => {
    expect(await parseReferenceLocalized("요한복음 3:16", ["ZZFUZ1"])).toMatchObject({
      bookId: 43,
    });
  });

  it("prefers the Gospel over the epistle/Revelation for a shared stem", async () => {
    // "요한" prefixes all four; the numeral-free, lowest-id book (the Gospel) wins.
    expect(await parseReferenceLocalized("요한 3:16", ["ZZFUZ2"])).toMatchObject({ bookId: 43 });
  });

  it("still resolves an exact stored name", async () => {
    expect(await parseReferenceLocalized("고린도전서 1:1", ["ZZFUZ3"])).toMatchObject({
      bookId: 46,
    });
  });
});
