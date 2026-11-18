import { describe, expect, it } from "vitest";
import { isKeptPicture, libraryPictureUrls } from "../offline-pictures";
import type { Set as PhytoSet } from "../types";

const set = (slides: object[]) => ({ id: "s", slides }) as unknown as PhytoSet;

describe("libraryPictureUrls", () => {
  it("lists every kept picture once, sorted, without videos or inline pictures", () => {
    const urls = libraryPictureUrls(
      [
        set([
          { kind: "image", imageUrl: "https://media.phyto.live/u/b.jpg" },
          { kind: "image", imageUrl: "data:image/png;base64,AA" },
          { kind: "video", videoSource: "youtube", youtubeId: "abc" },
          { kind: "video", videoSource: "file", videoUrl: "https://media.phyto.live/u/v.mp4" },
        ]),
        set([{ kind: "image", imageUrl: "https://media.phyto.live/u/b.jpg" }]),
        undefined,
      ],
      { bg: "black", bgDim: 0, bgImage: "https://media.phytoexp.live/u/a.jpg" },
    );
    expect(urls).toEqual([
      "https://i.ytimg.com/vi/abc/hqdefault.jpg",
      "https://media.phyto.live/u/b.jpg",
      "https://media.phytoexp.live/u/a.jpg",
    ]);
  });

  it("keeps only https pictures from our media and YouTube", () => {
    expect(isKeptPicture("https://media.phyto.live/x.jpg")).toBe(true);
    expect(isKeptPicture("http://media.phyto.live/x.jpg")).toBe(false);
    expect(isKeptPicture("https://example.com/x.jpg")).toBe(false);
    expect(isKeptPicture("not a url")).toBe(false);
  });
});
