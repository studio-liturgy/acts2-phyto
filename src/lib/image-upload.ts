/**
 * Slide images: downscale, then push to R2 and keep only the URL.
 *
 * Images used to be embedded in `sets.content` as base64 data URLs. That made
 * single sets weigh megabytes (a PDF import at 7.7MB was the worst), and since
 * the live-gathering viewer re-fetches full set content on every poll, those
 * bytes were re-sent to every viewer every 8 seconds. R2 is CDN-served and does
 * not count against the Supabase egress budget, so the URL is all that belongs
 * in the row.
 *
 * Every entry point degrades to a base64 data URL when the upload cannot
 * happen: signed out, offline, or the server refusing. The app is local-first
 * and must keep working in all three cases, so a slide is never lost for want
 * of a network. Those inline slides get hoisted to R2 later by
 * `lib/migrate-images.ts`.
 */

import { supabase } from "./supabase";
import { IMAGE_MAX_DIM, IMAGE_QUALITY, isUploadableImage } from "./media";

/** Result of preparing one image for a slide. `url` is either an R2 public URL
 *  or, when `inline` is true, a base64 data URL that still needs hoisting. */
export interface PreparedImage {
  url: string;
  inline: boolean;
}

/** Draw a bitmap onto a canvas downscaled so its longest edge is at most
 *  `maxDim`. Shared by the blob and data-URL encoders below. */
async function downscaleToCanvas(
  source: Blob,
  maxDim: number,
): Promise<HTMLCanvasElement | undefined> {
  const objectUrl = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read image"));
      i.src = objectUrl;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longest > maxDim ? maxDim / longest : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Downscale an image to a JPEG blob. Returns null if it cannot be decoded. */
export async function toCompressedImageBlob(
  source: Blob,
  maxDim = IMAGE_MAX_DIM,
  quality = IMAGE_QUALITY,
): Promise<Blob | null> {
  const canvas = await downscaleToCanvas(source, maxDim).catch(() => undefined);
  if (!canvas) return null;
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/** Encode an already-downscaled blob as a data URL, as-is.
 *
 *  Deliberately does NOT go back through a canvas: the blob has already been
 *  JPEG-encoded once, and re-encoding it would stack a second round of lossy
 *  compression on the fallback path for no benefit. */
export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/** POST a blob to the R2 upload route. Returns the public URL, or null on any
 *  failure (caller falls back to inline). `onQuotaExceeded` fires when the
 *  account is out of storage, so the UI can say so rather than silently
 *  inlining megabytes again. */
export async function uploadImageBlob(
  blob: Blob,
  onQuotaExceeded?: () => void,
): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const res = await fetch("/api/media/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });
    const json = (await res.json()) as { ok?: boolean; url?: string; code?: string };
    if (!res.ok || !json.ok || !json.url) {
      if (json.code === "quota") onQuotaExceeded?.();
      return null;
    }
    return json.url;
  } catch {
    return null;
  }
}

/** Prepare one already-rendered image (e.g. a PDF page) for a slide: upload it
 *  to R2, or fall back to an inline data URL. */
export async function prepareRenderedImage(
  blob: Blob,
  onQuotaExceeded?: () => void,
): Promise<PreparedImage | null> {
  const url = await uploadImageBlob(blob, onQuotaExceeded);
  if (url) return { url, inline: false };
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl ? { url: dataUrl, inline: true } : null;
}

/** Prepare a user-picked image file for a slide: downscale, then upload to R2,
 *  falling back to an inline data URL. Returns null if the file is not a
 *  supported image or cannot be decoded at all. */
export async function prepareImageFile(
  file: File,
  onQuotaExceeded?: () => void,
): Promise<PreparedImage | null> {
  if (!isUploadableImage(file.type)) return null;
  const blob = await toCompressedImageBlob(file);
  if (!blob) return null;
  return prepareRenderedImage(blob, onQuotaExceeded);
}

/** True if this slide image is still embedded in the row rather than in R2. */
export function isInlineImage(imageUrl: string | undefined): boolean {
  return typeof imageUrl === "string" && imageUrl.startsWith("data:");
}
