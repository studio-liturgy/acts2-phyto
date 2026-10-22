// An image-only PowerPoint file: one full-bleed picture per slide, 7.5 in tall
// and as wide as the screen shape (13.333 in for 16:9 widescreen). Hand-written OOXML with the minimum parts
// PowerPoint, Keynote, Google Slides and LibreOffice require (presentation,
// one master, one blank layout, a theme), zipped with zip-store.

import { zip, type ZipEntry } from "./zip-store";

const SLIDE_CY = 6858000;

/** Slide width in EMU for a width:height ratio (16:9 gives 12192000). */
export function slideWidthEmu(ratio = 16 / 9): number {
  return Math.round(SLIDE_CY * ratio);
}

const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function escapeXml(s: string): string {
  // XML 1.0 has no place for control characters other than tab, LF and CR.
  const allowed = Array.from(s)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
    })
    .join("");
  return allowed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rels(items: { id: string; type: string; target: string }[]): string {
  return (
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    items
      .map((r) => {
        const type = r.type.startsWith("http") ? r.type : `${REL}/${r.type}`;
        return `<Relationship Id="${r.id}" Type="${type}" Target="${r.target}"/>`;
      })
      .join("") +
    "</Relationships>"
  );
}

const EMPTY_TREE =
  '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const CLR_MAP =
  'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

function theme(): string {
  const srgb = (name: string, hex: string) => `<a:${name}><a:srgbClr val="${hex}"/></a:${name}>`;
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = (w: number) =>
    `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${solid}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return (
    XML +
    `<a:theme xmlns:a="${NS_A}" name="Office Theme"><a:themeElements>` +
    '<a:clrScheme name="Office">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    srgb("dk2", "44546A") +
    srgb("lt2", "E7E6E6") +
    srgb("accent1", "4472C4") +
    srgb("accent2", "ED7D31") +
    srgb("accent3", "A5A5A5") +
    srgb("accent4", "FFC000") +
    srgb("accent5", "5B9BD5") +
    srgb("accent6", "70AD47") +
    srgb("hlink", "0563C1") +
    srgb("folHlink", "954F72") +
    "</a:clrScheme>" +
    '<a:fontScheme name="Office">' +
    '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
    "</a:fontScheme>" +
    '<a:fmtScheme name="Office">' +
    `<a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst>` +
    `<a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>` +
    "<a:effectStyleLst>" +
    "<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3) +
    "</a:effectStyleLst>" +
    `<a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst>` +
    "</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>"
  );
}

function slideMaster(): string {
  return (
    XML +
    `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' +
    EMPTY_TREE +
    "</p:spTree></p:cSld>" +
    `<p:clrMap ${CLR_MAP}/>` +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    "<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>" +
    "</p:sldMaster>"
  );
}

function slideLayout(): string {
  return (
    XML +
    `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1">` +
    '<p:cSld name="Blank">' +
    EMPTY_TREE +
    "</p:spTree></p:cSld>" +
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"
  );
}

function slide(n: number, SLIDE_CX: number): string {
  return (
    XML +
    `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    "<p:cSld>" +
    EMPTY_TREE +
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide ${n}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
    `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${SLIDE_CX}" cy="${SLIDE_CY}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    "</p:pic></p:spTree></p:cSld>" +
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
  );
}

/** The parts of the file, in zip order ([Content_Types].xml first). */
/** One slide's picture: PNG for text on plain backgrounds, JPEG for photos. */
export interface SlideImage {
  type: "png" | "jpeg";
  data: Uint8Array;
}

export function pptxParts(images: SlideImage[], title: string, ratio = 16 / 9): ZipEntry[] {
  const SLIDE_CX = slideWidthEmu(ratio);
  const enc = new TextEncoder();
  // XML parts are compressed: macOS Preview misreads an all-stored package.
  const text = (name: string, xml: string): ZipEntry => ({
    name,
    data: enc.encode(xml),
    deflate: true,
  });
  const n = images.length;
  const nums = Array.from({ length: n }, (_, i) => i + 1);

  const contentTypes =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>' +
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>' +
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    nums
      .map(
        (i) =>
          `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      )
      .join("") +
    "</Types>";

  // rId1 master, rId2..n+1 slides, then theme and the three props parts.
  const presentation =
    XML +
    `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    (n > 0
      ? "<p:sldIdLst>" +
        nums.map((i) => `<p:sldId id="${255 + i}" r:id="rId${i + 1}"/>`).join("") +
        "</p:sldIdLst>"
      : "") +
    `<p:sldSz cx="${SLIDE_CX}" cy="${SLIDE_CY}"/><p:notesSz cx="6858000" cy="9144000"/>` +
    "<p:defaultTextStyle/></p:presentation>";

  const presentationRels = rels([
    { id: "rId1", type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
    ...nums.map((i) => ({ id: `rId${i + 1}`, type: "slide", target: `slides/slide${i}.xml` })),
    { id: `rId${n + 2}`, type: "theme", target: "theme/theme1.xml" },
    { id: `rId${n + 3}`, type: "presProps", target: "presProps.xml" },
    { id: `rId${n + 4}`, type: "viewProps", target: "viewProps.xml" },
    { id: `rId${n + 5}`, type: "tableStyles", target: "tableStyles.xml" },
  ]);

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const core =
    XML +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title><dc:creator>phyto</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    "</cp:coreProperties>";
  const app =
    XML +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    `<Application>phyto</Application><Slides>${n}</Slides><PresentationFormat>Widescreen</PresentationFormat>` +
    "</Properties>";

  return [
    text("[Content_Types].xml", contentTypes),
    text(
      "_rels/.rels",
      rels([
        { id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" },
        {
          id: "rId2",
          type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
          target: "docProps/core.xml",
        },
        { id: "rId3", type: "extended-properties", target: "docProps/app.xml" },
      ]),
    ),
    text("docProps/core.xml", core),
    text("docProps/app.xml", app),
    text("ppt/presentation.xml", presentation),
    text("ppt/_rels/presentation.xml.rels", presentationRels),
    text(
      "ppt/presProps.xml",
      XML + `<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`,
    ),
    text(
      "ppt/viewProps.xml",
      XML +
        `<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`,
    ),
    text(
      "ppt/tableStyles.xml",
      XML + `<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
    ),
    text("ppt/theme/theme1.xml", theme()),
    text("ppt/slideMasters/slideMaster1.xml", slideMaster()),
    text(
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      rels([
        { id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" },
        { id: "rId2", type: "theme", target: "../theme/theme1.xml" },
      ]),
    ),
    text("ppt/slideLayouts/slideLayout1.xml", slideLayout()),
    text(
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      rels([{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }]),
    ),
    ...nums.flatMap((i) => [
      text(`ppt/slides/slide${i}.xml`, slide(i, SLIDE_CX)),
      text(
        `ppt/slides/_rels/slide${i}.xml.rels`,
        rels([
          { id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" },
          { id: "rId2", type: "image", target: `../media/image${i}.${images[i - 1].type}` },
        ]),
      ),
      { name: `ppt/media/image${i}.${images[i - 1].type}`, data: images[i - 1].data },
    ]),
  ];
}

/** The .pptx file bytes. */
export function buildImagePptx(
  images: SlideImage[],
  title: string,
  ratio = 16 / 9,
): Promise<Uint8Array> {
  return zip(pptxParts(images, title, ratio));
}
