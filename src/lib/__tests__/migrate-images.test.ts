import { describe, it, expect, vi } from "vitest";
import { dataUrlToBlob, hasInlineImages, migrateSlideImages } from "../migrate-images";
import type { Slide } from "../types";

// 1x1 transparent GIF.
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function imageSlide(id: string, imageUrl: string): Slide {
  return { id, kind: "image", imageUrl, lines: [] };
}

describe("dataUrlToBlob", () => {
  it("decodes a base64 data URL, preserving the MIME type", async () => {
    const blob = dataUrlToBlob(GIF);
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe("image/gif");
    expect(blob!.size).toBeGreaterThan(0);
  });

  it("decodes a non-base64 (percent-encoded) data URL", async () => {
    const blob = dataUrlToBlob("data:text/plain,hello%20world");
    expect(await blob!.text()).toBe("hello world");
  });

  it("returns null for a non-data URL", () => {
    expect(dataUrlToBlob("https://media.phyto.live/u/abc.jpg")).toBeNull();
  });

  it("returns null for malformed base64 rather than throwing", () => {
    expect(dataUrlToBlob("data:image/jpeg;base64,!!!not-base64!!!")).toBeNull();
  });
});

describe("hasInlineImages", () => {
  it("detects an inline image", () => {
    expect(hasInlineImages([imageSlide("a", GIF)])).toBe(true);
  });

  it("ignores slides already on R2", () => {
    expect(hasInlineImages([imageSlide("a", "https://media.phyto.live/u/a.jpg")])).toBe(false);
  });

  it("ignores slides with no image at all", () => {
    expect(hasInlineImages([{ id: "a", kind: "lyric", lines: ["hi"] }])).toBe(false);
  });
});

describe("migrateSlideImages", () => {
  it("replaces inline images with the uploaded URL", async () => {
    const upload = vi.fn().mockResolvedValue("https://media.phyto.live/u/new.jpg");
    const result = await migrateSlideImages([imageSlide("a", GIF)], upload);

    expect(result.moved).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.slides[0].imageUrl).toBe("https://media.phyto.live/u/new.jpg");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("leaves non-inline slides completely untouched", async () => {
    const upload = vi.fn().mockResolvedValue("https://media.phyto.live/u/new.jpg");
    const slides: Slide[] = [
      imageSlide("a", "https://media.phyto.live/u/existing.jpg"),
      { id: "b", kind: "lyric", lines: ["verse"] },
    ];
    const result = await migrateSlideImages(slides, upload);

    expect(upload).not.toHaveBeenCalled();
    expect(result.moved).toBe(0);
    expect(result.slides).toEqual(slides);
  });

  it("keeps the data URL when the upload fails, so nothing is lost", async () => {
    const upload = vi.fn().mockResolvedValue(null);
    const result = await migrateSlideImages([imageSlide("a", GIF)], upload);

    expect(result.moved).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.slides[0].imageUrl).toBe(GIF);
  });

  it("migrates the slides it can and leaves the rest, on a partial failure", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce("https://media.phyto.live/u/1.jpg")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("https://media.phyto.live/u/3.jpg");
    const result = await migrateSlideImages(
      [imageSlide("a", GIF), imageSlide("b", GIF), imageSlide("c", GIF)],
      upload,
    );

    expect(result.moved).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.slides.map((s) => s.imageUrl)).toEqual([
      "https://media.phyto.live/u/1.jpg",
      GIF,
      "https://media.phyto.live/u/3.jpg",
    ]);
  });

  it("counts an undecodable data URL as failed without calling upload", async () => {
    const upload = vi.fn().mockResolvedValue("https://media.phyto.live/u/new.jpg");
    const result = await migrateSlideImages(
      [imageSlide("a", "data:image/jpeg;base64,!!!bad!!!")],
      upload,
    );

    expect(upload).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.slides[0].imageUrl).toBe("data:image/jpeg;base64,!!!bad!!!");
  });

  it("preserves slide order and every other field", async () => {
    const upload = vi.fn().mockResolvedValue("https://media.phyto.live/u/new.jpg");
    const slides: Slide[] = [
      { id: "a", kind: "image", imageUrl: GIF, lines: [], title: "Title", section: "Intro" },
    ];
    const result = await migrateSlideImages(slides, upload);

    expect(result.slides[0]).toEqual({
      id: "a",
      kind: "image",
      imageUrl: "https://media.phyto.live/u/new.jpg",
      lines: [],
      title: "Title",
      section: "Intro",
    });
  });

  it("uploads sequentially rather than all at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const upload = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return "https://media.phyto.live/u/x.jpg";
    });

    await migrateSlideImages([imageSlide("a", GIF), imageSlide("b", GIF)], upload);

    expect(maxInFlight).toBe(1);
  });
});
