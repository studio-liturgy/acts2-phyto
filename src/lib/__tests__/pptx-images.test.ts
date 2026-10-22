import { describe, expect, it } from "vitest";
import { crc32, unzipStore, zipStore } from "../zip-store";
import { buildImagePptx, pptxParts, slideWidthEmu } from "../pptx-images";

const enc = new TextEncoder();
const dec = new TextDecoder();

describe("zipStore", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });
  it("round-trips entries in order", () => {
    const zip = zipStore([
      { name: "a.txt", data: enc.encode("hello") },
      { name: "dir/b.bin", data: new Uint8Array([0, 1, 2, 255]) },
    ]);
    const back = unzipStore(zip);
    expect(back.map((e) => e.name)).toEqual(["a.txt", "dir/b.bin"]);
    expect(dec.decode(back[0].data)).toBe("hello");
    expect([...back[1].data]).toEqual([0, 1, 2, 255]);
  });
  it("ends with a central directory that counts every entry", () => {
    const zip = zipStore([
      { name: "a", data: enc.encode("x") },
      { name: "b", data: enc.encode("y") },
    ]);
    const end = new DataView(zip.buffer, zip.length - 22);
    expect(end.getUint32(0, true)).toBe(0x06054b50);
    expect(end.getUint16(10, true)).toBe(2);
  });
});

describe("buildImagePptx", () => {
  const jpeg = (n: number) => ({
    type: "jpeg" as const,
    data: new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9]),
  });
  const png = (n: number) => ({ type: "png" as const, data: new Uint8Array([0x89, 0x50, n]) });

  it("puts [Content_Types].xml first and one slide + image per JPEG", () => {
    const names = pptxParts([jpeg(1), jpeg(2), jpeg(3)], "Sunday").map((p) => p.name);
    expect(names[0]).toBe("[Content_Types].xml");
    for (const i of [1, 2, 3]) {
      expect(names).toContain(`ppt/slides/slide${i}.xml`);
      expect(names).toContain(`ppt/slides/_rels/slide${i}.xml.rels`);
      expect(names).toContain(`ppt/media/image${i}.jpeg`);
    }
  });

  it("keeps the slides in order and their pictures attached", () => {
    const parts = unzipStore(buildImagePptx([jpeg(7), jpeg(8)], "Sunday"));
    const get = (n: string) => parts.find((p) => p.name === n)!;
    expect([...get("ppt/media/image2.jpeg").data]).toEqual([...jpeg(8).data]);
    const pres = dec.decode(get("ppt/presentation.xml").data);
    expect(pres).toContain('<p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/>');
    expect(pres).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
    const rels = dec.decode(get("ppt/_rels/presentation.xml.rels").data);
    expect(rels).toContain(
      'Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"',
    );
    expect(rels).toContain(
      'Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"',
    );
    expect(dec.decode(get("ppt/slides/_rels/slide2.xml.rels").data)).toContain(
      'Target="../media/image2.jpeg"',
    );
  });

  it("keeps each slide's picture format (PNG text slides, JPEG photos)", () => {
    const parts = unzipStore(buildImagePptx([png(1), jpeg(2)], "x"));
    const names = parts.map((p) => p.name);
    expect(names).toContain("ppt/media/image1.png");
    expect(names).toContain("ppt/media/image2.jpeg");
    const rel1 = dec.decode(parts.find((p) => p.name === "ppt/slides/_rels/slide1.xml.rels")!.data);
    expect(rel1).toContain('Target="../media/image1.png"');
    expect(dec.decode(parts[0].data)).toContain('Extension="png" ContentType="image/png"');
  });

  it("declares every slide's content type", () => {
    const parts = pptxParts([jpeg(1), jpeg(2)], "x");
    const types = dec.decode(parts[0].data);
    expect(types).toContain('PartName="/ppt/slides/slide1.xml"');
    expect(types).toContain('PartName="/ppt/slides/slide2.xml"');
    expect(types).toContain('Extension="jpeg" ContentType="image/jpeg"');
  });

  it("escapes the title", () => {
    const core = pptxParts([], 'Youth & Kids <"Easter">').find(
      (p) => p.name === "docProps/core.xml",
    )!;
    expect(dec.decode(core.data)).toContain(
      "<dc:title>Youth &amp; Kids &lt;&quot;Easter&quot;&gt;</dc:title>",
    );
  });

  it("writes well-formed XML in every part", () => {
    const parser = new DOMParser();
    for (const p of pptxParts([jpeg(1)], "Sunday")) {
      if (!p.name.endsWith(".xml") && !p.name.endsWith(".rels")) continue;
      const doc = parser.parseFromString(dec.decode(p.data), "application/xml");
      expect(doc.getElementsByTagName("parsererror").length, p.name).toBe(0);
    }
  });
});

describe("slide shape", () => {
  const jpeg = (n: number) => ({ type: "jpeg" as const, data: new Uint8Array([n]) });
  it("keeps 7.5 in tall and widens with the ratio", () => {
    expect(slideWidthEmu()).toBe(12192000);
    expect(slideWidthEmu(4 / 3)).toBe(9144000);
    const pres = new TextDecoder().decode(
      pptxParts([jpeg(1)], "x", 4 / 3).find((e) => e.name === "ppt/presentation.xml")!.data,
    );
    expect(pres).toContain('<p:sldSz cx="9144000" cy="6858000"/>');
    const slide = new TextDecoder().decode(
      pptxParts([jpeg(1)], "x", 4 / 3).find((e) => e.name === "ppt/slides/slide1.xml")!.data,
    );
    expect(slide).toContain('cx="9144000" cy="6858000"');
  });
});
