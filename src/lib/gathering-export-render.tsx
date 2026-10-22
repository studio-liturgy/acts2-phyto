// Draws a gathering's slides into pictures (exactly as the output window
// shows them, via the same SlideView) and packs them into a PDF or PPTX.
// Browser only; loaded on demand when someone exports.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { SlideView } from "@/components/SlideView";
import { stageSize } from "./slide-fit";
import { useLibrary } from "./store";
import {
  containRect,
  exportFetchUrl,
  exportFileName,
  videoPosterSource,
  type ExportFormat,
  type ExportSlide,
} from "./gathering-export";

import type { SlideImage } from "./pptx-images";

// Slides are drawn at twice the stage size (3840×2160) so text stays sharp on
// high-density screens and projectors, and when zoomed in a PDF viewer.
const EXPORT_SCALE = 2;
const JPEG_QUALITY = 0.92;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(exportFetchUrl(url));
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/** An image URL the canvas can draw: data URLs as they are, anything else
 *  fetched and inlined. Null when it can't be read (drawn without it). */
async function inlineImage(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  const blob = await fetchBlob(url);
  return blob ? blobToDataUrl(blob) : null;
}

/** Encode a slide. Text on a plain background goes out as PNG (lossless, so
 *  letter edges stay crisp, and small); slides with a photo or video frame
 *  as JPEG, which keeps photos to a sensible size. */
async function encode(canvas: HTMLCanvasElement, photo: boolean): Promise<SlideImage> {
  const type = photo ? "jpeg" : "png";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image encode failed"))),
      `image/${type}`,
      photo ? JPEG_QUALITY : undefined,
    ),
  );
  return { type, data: new Uint8Array(await blob.arrayBuffer()) };
}

/** The export's slide shape: the screen shape set in the Background card. */
function exportStage(): { w: number; h: number } {
  return stageSize(useLibrary.getState().background.aspect);
}

type Stage = { w: number; h: number };

function blackCanvas({ w: STAGE_W, h: STAGE_H }: Stage): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  return { canvas, ctx };
}

/** YouTube's larger thumbnails first; the 4:3 ones carry black bars above and
 *  below a 16:9 video, so they're cropped to the middle 16:9. */
async function youtubeFrame(id: string): Promise<ImageBitmap | null> {
  for (const name of ["maxresdefault", "sddefault", "hqdefault"]) {
    const blob = await fetchBlob(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
    if (!blob) continue;
    try {
      const bmp = await createImageBitmap(blob);
      // maxresdefault answers a small grey placeholder when it doesn't exist.
      if (bmp.width < 200) continue;
      if (Math.abs(bmp.width / bmp.height - 4 / 3) < 0.05) {
        const h = Math.round((bmp.width * 9) / 16);
        return createImageBitmap(bmp, 0, Math.round((bmp.height - h) / 2), bmp.width, h);
      }
      return bmp;
    } catch {
      // try the next size
    }
  }
  return null;
}

/** One frame from an uploaded or linked video, about a second in. */
function videoFrame(url: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok ? v : null);
    };
    const timer = setTimeout(() => done(false), 20_000);
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 0) * 0.1);
    };
    v.onseeked = () => done(v.videoWidth > 0);
    v.onerror = () => done(false);
    v.src = exportFetchUrl(url);
  });
}

async function renderVideoSlide(slide: ExportSlide["slide"], stage: Stage): Promise<SlideImage> {
  const { canvas, ctx } = blackCanvas(stage);
  const src = videoPosterSource(slide);
  let frame: CanvasImageSource | null = null;
  let w = 0;
  let h = 0;
  if (src.kind === "image" && slide.youtubeId) {
    const bmp = await youtubeFrame(slide.youtubeId);
    if (bmp) [frame, w, h] = [bmp, bmp.width, bmp.height];
  } else if (src.kind === "video") {
    const v = await videoFrame(src.url);
    if (v) [frame, w, h] = [v, v.videoWidth, v.videoHeight];
  }
  if (frame) {
    const r = containRect(w, h, stage.w, stage.h);
    try {
      ctx.drawImage(frame, r.x, r.y, r.w, r.h);
    } catch {
      // a tainted or broken frame stays black
    }
  }
  return encode(canvas, true);
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Render each slide to a picture at twice the stage (3840×2160 for 16:9), in
 *  order. `onProgress(done, total)` fires after every slide. */
export async function renderExportSlides(
  slides: ExportSlide[],
  onProgress?: (done: number, total: number) => void,
  stage: Stage = exportStage(),
): Promise<SlideImage[]> {
  const { w: STAGE_W, h: STAGE_H } = stage;
  // The background, with its image inlined so the canvas can draw it.
  const back = useLibrary.getState().background;
  const background = back.bgImage
    ? { ...back, bgImage: (await inlineImage(back.bgImage)) ?? undefined }
    : back;
  const { toCanvas } = await import("html-to-image");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-30000px",
    top: "0",
    width: `${STAGE_W}px`,
    height: `${STAGE_H}px`,
    pointerEvents: "none",
  });
  document.body.appendChild(host);
  const root = createRoot(host);
  const images = new Map<string, string | null>();
  const out: SlideImage[] = [];
  try {
    await document.fonts.ready;
    for (const [i, item] of slides.entries()) {
      if (item.slide.kind === "video") {
        out.push(await renderVideoSlide(item.slide, stage));
      } else {
        let slide = item.slide;
        if (slide.imageUrl) {
          if (!images.has(slide.imageUrl))
            images.set(slide.imageUrl, await inlineImage(slide.imageUrl));
          slide = { ...slide, imageUrl: images.get(slide.imageUrl) ?? undefined };
        }
        flushSync(() =>
          root.render(
            <SlideView
              key={`${i}`}
              slide={slide}
              versions={item.versions}
              template={{ ...item.template, background }}
              variant="stage"
              className="h-full w-full"
            />,
          ),
        );
        // Let the size observers settle (scale, shrink-to-fit) before drawing.
        await nextFrame();
        await nextFrame();
        await nextFrame();
        const node = host.firstElementChild as HTMLElement;
        const canvas = await toCanvas(node, {
          width: STAGE_W,
          height: STAGE_H,
          pixelRatio: EXPORT_SCALE,
          skipFonts: true,
          cacheBust: false,
        });
        // Text over the background image stays PNG: JPEG softens it.
        out.push(await encode(canvas, !!slide.imageUrl));
      }
      onProgress?.(i + 1, slides.length);
    }
  } finally {
    root.unmount();
    host.remove();
  }
  return out;
}

/** The PDF, built in a worker so the page (and its spinner) keeps running.
 *  Falls back to building it here if a worker can't start. */
async function buildPdf(images: SlideImage[], stage: Stage): Promise<Blob> {
  const ratio = stage.w / stage.h;
  let bytes: Uint8Array;
  try {
    bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const worker = new Worker(new URL("./pdf-build.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (e: MessageEvent<{ ok: boolean; bytes?: Uint8Array; error?: string }>) => {
        worker.terminate();
        if (e.data.ok && e.data.bytes) resolve(e.data.bytes);
        else reject(new Error(e.data.error ?? "PDF worker failed"));
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      worker.postMessage({ images, ratio });
    });
  } catch (err) {
    console.warn("PDF worker unavailable, building on the page", err);
    const { buildPdfBytes } = await import("./pdf-build");
    bytes = await buildPdfBytes(images, ratio);
  }
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

async function buildPptx(images: SlideImage[], title: string, stage: Stage): Promise<Blob> {
  const { buildImagePptx } = await import("./pptx-images");
  const bytes = await buildImagePptx(images, title, stage.w / stage.h);
  return new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Render, pack and download. */
export async function exportGatheringFile(
  name: string,
  slides: ExportSlide[],
  format: ExportFormat,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const stage = exportStage();
  const images = await renderExportSlides(slides, onProgress, stage);
  const file =
    format === "pdf" ? await buildPdf(images, stage) : await buildPptx(images, name, stage);
  download(file, exportFileName(name, format));
}
