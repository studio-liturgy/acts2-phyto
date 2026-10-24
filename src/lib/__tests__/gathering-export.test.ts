import { describe, expect, it } from "vitest";
import {
  containRect,
  exportFetchUrl,
  exportFileName,
  gatheringExportSlides,
  isOwnMediaUrl,
  playedSlides,
  setExportSlides,
  templateForSet,
  videoPosterSource,
  type ExportContext,
} from "../gathering-export";
import type { Gathering, Set as PhytoSet, SetTemplate, Slide } from "../types";

const songTpl: SetTemplate = { fontScale: 1.2 };
const scriptureTpl: SetTemplate = { align: "left" };
const mediaTpl: SetTemplate = { bg: "white" };

function set(
  id: string,
  kind: PhytoSet["kind"],
  slides: Partial<Slide>[],
  extra: Partial<PhytoSet> = {},
): PhytoSet {
  return {
    id,
    name: id,
    kind,
    slides: slides.map((s, i) => ({ id: `${id}-${i}`, kind: "lyric", ...s }) as Slide),
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  } as PhytoSet;
}

// Verse, Chorus, Bridge: one slide each.
const song = set("song", "song", [
  { id: "v", section: "Verse" },
  { id: "c", section: "Chorus" },
  { id: "b", section: "Bridge" },
]);
const scripture = set("scr", "scripture", [
  { id: "s1", kind: "scripture", section: "John 3:16" },
  { id: "s2", kind: "scripture", section: "John 3:17" },
]);
const media = set(
  "med",
  "media",
  [{ id: "m1", kind: "image", imageUrl: "https://media.phyto.live/u/a.jpg" }],
  {
    template: mediaTpl,
  },
);

function ctx(over: Partial<ExportContext> = {}): ExportContext {
  return {
    sets: { song, scr: scripture, med: media },
    songTemplate: songTpl,
    scriptureTemplate: scriptureTpl,
    arrangementsOn: false,
    arranged: {},
    hidden: {},
    ...over,
  };
}

const gathering = { id: "g", name: "Sunday", setIds: ["song", "scr", "med"] } as Gathering;
const ids = (slides: Slide[]) => slides.map((s) => s.id);

describe("templateForSet", () => {
  it("picks the template the output window uses", () => {
    expect(templateForSet(song, songTpl, scriptureTpl)).toBe(songTpl);
    expect(templateForSet(scripture, songTpl, scriptureTpl)).toBe(scriptureTpl);
    expect(templateForSet(set("msg", "message", []), songTpl, scriptureTpl)).toBe(scriptureTpl);
    expect(templateForSet(media, songTpl, scriptureTpl)).toBe(mediaTpl);
  });
});

describe("playedSlides", () => {
  it("is the written order by default", () => {
    expect(ids(playedSlides(song, ctx()))).toEqual(["v", "c", "b"]);
  });
  it("leaves out sections hidden with the eye", () => {
    expect(ids(playedSlides(song, ctx({ hidden: { song: ["Bridge#0"] } })))).toEqual(["v", "c"]);
    expect(ids(playedSlides(scripture, ctx({ hidden: { scr: ["John 3:17#0"] } })))).toEqual(["s1"]);
  });
  it("follows a song's arrangement, repeats included, when arrangements are on", () => {
    const c = ctx({
      arrangementsOn: true,
      arranged: { song: ["Verse#0", "Chorus#0", "Chorus#0", "Bridge#0"] },
    });
    expect(ids(playedSlides(song, c))).toEqual(["v", "c", "c", "b"]);
  });
  it("ignores stored arrangements when the setting is off", () => {
    const c = ctx({ arranged: { song: ["Chorus#0", "Verse#0"] } });
    expect(ids(playedSlides(song, c))).toEqual(["v", "c", "b"]);
  });
  it("starts an unarranged song from the eye's hides when arrangements are on", () => {
    const c = ctx({ arrangementsOn: true, hidden: { song: ["Verse#0"] } });
    expect(ids(playedSlides(song, c))).toEqual(["c", "b"]);
  });
});

describe("gatheringExportSlides", () => {
  it("runs every set in gathering order with its template", () => {
    const out = gatheringExportSlides(gathering, ctx());
    expect(out.map((s) => s.slide.id)).toEqual(["v", "c", "b", "s1", "s2", "m1"]);
    expect(out[0].template).toBe(songTpl);
    expect(out[3].template).toBe(scriptureTpl);
    expect(out[5].template).toBe(mediaTpl);
  });
  it("includes a set each time it appears and skips sets not in the library", () => {
    const g = { ...gathering, setIds: ["scr", "missing", "scr"] };
    expect(gatheringExportSlides(g, ctx()).map((s) => s.slide.id)).toEqual([
      "s1",
      "s2",
      "s1",
      "s2",
    ]);
  });
  it("passes stacked versions through for scripture", () => {
    const stacked = {
      ...scripture,
      versions: ["NIV", "CUNP"],
      slides: scripture.slides.map((s) => ({ ...s, linesByVersion: { NIV: "a", CUNP: "b" } })),
    } as PhytoSet;
    const out = gatheringExportSlides(
      { ...gathering, setIds: ["scr"] },
      ctx({ sets: { scr: stacked } }),
    );
    expect(out[0].versions).toEqual(["NIV", "CUNP"]);
  });
});

describe("exportFileName", () => {
  it("names the file after the gathering", () => {
    expect(exportFileName("Sunday 9am", "pdf")).toBe("Sunday 9am.pdf");
    expect(exportFileName("Sunday 9am", "pptx")).toBe("Sunday 9am.pptx");
  });
  it("drops characters file systems reject", () => {
    expect(exportFileName('Easter: 4/20 "Sunrise"', "pdf")).toBe("Easter 4 20 Sunrise.pdf");
  });
  it("falls back when the name is empty", () => {
    expect(exportFileName("  ", "pdf")).toBe("Gathering.pdf");
    expect(exportFileName("...", "pptx")).toBe("Gathering.pptx");
  });
  it("keeps non-Latin names", () => {
    expect(exportFileName("主日崇拜", "pdf")).toBe("主日崇拜.pdf");
  });
});

describe("videoPosterSource", () => {
  it("uses the YouTube thumbnail", () => {
    expect(
      videoPosterSource({ id: "x", kind: "video", videoSource: "youtube", youtubeId: "abc" }),
    ).toEqual({
      kind: "image",
      url: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
    });
  });
  it("grabs a frame from an uploaded or linked file", () => {
    const url = "https://media.phyto.live/u/v.mp4";
    expect(
      videoPosterSource({ id: "x", kind: "video", videoSource: "file", videoUrl: url }),
    ).toEqual({
      kind: "video",
      url,
    });
  });
  it("is black when there's nothing to show", () => {
    expect(videoPosterSource({ id: "x", kind: "video" })).toEqual({ kind: "none" });
  });
});

describe("exportFetchUrl", () => {
  it("routes our media domains through the same-origin reader", () => {
    expect(exportFetchUrl("https://media.phyto.live/u/a.jpg")).toBe(
      "/api/media/raw?u=https%3A%2F%2Fmedia.phyto.live%2Fu%2Fa.jpg",
    );
    expect(isOwnMediaUrl("https://media.phytoexp.live/u/a.jpg")).toBe(true);
  });
  it("leaves everything else alone", () => {
    expect(exportFetchUrl("data:image/png;base64,xx")).toBe("data:image/png;base64,xx");
    expect(exportFetchUrl("https://i.ytimg.com/vi/a/hqdefault.jpg")).toBe(
      "https://i.ytimg.com/vi/a/hqdefault.jpg",
    );
  });
  it("never proxies look-alike hosts", () => {
    expect(isOwnMediaUrl("https://media.phyto.live.evil.com/a.jpg")).toBe(false);
    expect(isOwnMediaUrl("http://media.phyto.live/a.jpg")).toBe(false);
    expect(isOwnMediaUrl("not a url")).toBe(false);
  });
});

describe("containRect", () => {
  it("letterboxes a 4:3 frame in 16:9", () => {
    expect(containRect(1440, 1080, 1920, 1080)).toEqual({ x: 240, y: 0, w: 1440, h: 1080 });
  });
  it("fills when the shape matches", () => {
    expect(containRect(1280, 720, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
});

describe("setExportSlides", () => {
  it("exports every slide of the set as written, with its template", () => {
    const out = setExportSlides(song, songTpl, scriptureTpl);
    expect(out.map((s) => s.slide.id)).toEqual(["v", "c", "b"]);
    expect(out.every((s) => s.template === songTpl && s.setId === "song")).toBe(true);
  });
});
