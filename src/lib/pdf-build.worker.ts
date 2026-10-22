// Builds the export PDF off the page (see pdf-build.ts).
import { buildPdfBytes } from "./pdf-build";
import type { SlideImage } from "./pptx-images";

self.onmessage = async (e: MessageEvent<{ images: SlideImage[]; ratio: number }>) => {
  try {
    const bytes = await buildPdfBytes(e.data.images, e.data.ratio);
    (self as unknown as Worker).postMessage({ ok: true, bytes }, [bytes.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
