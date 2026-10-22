// Packs the export's slide pictures into a PDF. pdf-lib's PNG embedding is
// heavy (it decodes and recompresses every 3840-wide picture), so it runs in a
// worker (pdf-build.worker.ts): on the page it froze the tab for seconds.

import type { SlideImage } from "./pptx-images";

/** Page size in points: PowerPoint's widescreen height (7.5 in), as wide as
 *  the shape. 960 x 540 for 16:9. */
export function pdfPageSize(ratio: number): { w: number; h: number } {
  const h = 540;
  return { w: Math.round(h * ratio), h };
}

export async function buildPdfBytes(images: SlideImage[], ratio: number): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const { w: W, h: H } = pdfPageSize(ratio);
  for (const image of images) {
    const img =
      image.type === "png" ? await doc.embedPng(image.data) : await doc.embedJpg(image.data);
    doc.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return doc.save();
}
