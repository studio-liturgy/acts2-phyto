import { describe, expect, it } from "vitest";
import { setsAround, setsMedia, slideImageUrls, youtubePosterUrl } from "../media-preload";
import type { Set as PhytoSet, Slide } from "../types";

const set = (id: string, slides: Slide[]): PhytoSet => ({
  id,
  name: id,
  kind: "media",
  slides,
  createdAt: 0,
  updatedAt: 0,
});

describe("media to fetch ahead (Stage Output, screen link)", () => {
  it("a slide's own picture wins over the backdrop", () => {
    const bg = { bg: "black" as const, bgDim: 40, bgImage: "back.jpg" };
    expect(slideImageUrls({ id: "a", kind: "image", imageUrl: "a.jpg" }, bg)).toEqual(["a.jpg"]);
    expect(slideImageUrls({ id: "b", kind: "lyric" }, bg)).toEqual(["back.jpg"]);
    expect(slideImageUrls({ id: "c", kind: "lyric" })).toEqual([]);
  });

  it("a YouTube slide's poster counts as a picture", () => {
    const yt: Slide = { id: "y", kind: "video", videoSource: "youtube", youtubeId: "abc" };
    expect(slideImageUrls(yt)).toEqual([youtubePosterUrl("abc")]);
  });

  it("collects pictures and video files without repeats", () => {
    const m = setsMedia(
      [
        set("s1", [
          { id: "1", kind: "image", imageUrl: "a.jpg" },
          { id: "2", kind: "image", imageUrl: "a.jpg" },
          { id: "3", kind: "video", videoUrl: "v.mp4" },
        ]),
        undefined,
        set("s2", [{ id: "4", kind: "video", videoUrl: "v.mp4" }]),
      ],
      { bg: "black", bgDim: 40, bgImage: "back.jpg" },
    );
    expect(m.images.sort()).toEqual(["a.jpg", "back.jpg"]);
    expect(m.videos).toEqual(["v.mp4"]);
  });

  it("videos: the live set and the next one", () => {
    expect(setsAround(["a", "b", "c"], "b")).toEqual(["b", "c"]);
    expect(setsAround(["a", "b", "c"], "c")).toEqual(["c"]);
    expect(setsAround(["a", "b"], null)).toEqual(["a"]);
    expect(setsAround(["a", "b"], "x")).toEqual(["x"]);
  });
});
