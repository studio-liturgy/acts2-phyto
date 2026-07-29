/**
 * Hoist legacy inline base64 slide images into R2.
 *
 * Sets created before images moved to R2 still carry `data:` URLs inside
 * `content`, which is what pushed the library to ~22MB across 375 sets and put
 * multi-megabyte rows in front of every live-gathering poll. This walks a set's
 * slides, uploads each inline image, and swaps in the returned URL.
 *
 * Non-destructive by construction: a slide whose upload fails keeps its data
 * URL and is retried on a later pass. Nothing is deleted, so a half-migrated
 * set renders exactly as before.
 */

import type { Slide } from "./types";
import { isInlineImage, uploadImageBlob } from "./image-upload";

/** Uploads a blob and resolves to its public URL, or null on failure.
 *  Injected so the migration can be tested without a browser/network. */
export type ImageUploader = (blob: Blob) => Promise<string | null>;

export interface MigrationResult {
  slides: Slide[];
  /** How many inline images became R2 URLs. */
  moved: number;
  /** How many were left inline (upload refused, or undecodable). */
  failed: number;
}

/** Decode a `data:` URL into a Blob. Returns null for anything malformed, so a
 *  corrupt slide is skipped rather than throwing mid-migration. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const [, mime, base64Marker, payload] = match;
  const type = mime || "application/octet-stream";
  try {
    if (base64Marker) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(payload)], { type });
  } catch {
    return null;
  }
}

/** True if any slide still holds an inline image. Cheap pre-check so the
 *  migration can skip the overwhelming majority of sets untouched. */
export function hasInlineImages(slides: Slide[]): boolean {
  return slides.some((sl) => isInlineImage(sl.imageUrl));
}

/** Replace every inline image in `slides` with an uploaded R2 URL.
 *
 *  Uploads run sequentially: a set can hold dozens of slides (one per PDF
 *  page), and firing them all at once would spike memory holding every decoded
 *  blob and risk tripping the upload route's rate limit. */
export async function migrateSlideImages(
  slides: Slide[],
  upload: ImageUploader,
): Promise<MigrationResult> {
  let moved = 0;
  let failed = 0;
  const next: Slide[] = [];

  for (const slide of slides) {
    if (!isInlineImage(slide.imageUrl)) {
      next.push(slide);
      continue;
    }
    const blob = dataUrlToBlob(slide.imageUrl as string);
    if (!blob) {
      failed += 1;
      next.push(slide);
      continue;
    }
    const url = await upload(blob);
    if (!url) {
      failed += 1;
      next.push(slide);
      continue;
    }
    moved += 1;
    next.push({ ...slide, imageUrl: url });
  }

  return { slides: next, moved, failed };
}

/** Production wrapper: migrates a set's slides using the real R2 uploader. */
export function migrateSetImagesToR2(slides: Slide[]): Promise<MigrationResult> {
  return migrateSlideImages(slides, (blob) => uploadImageBlob(blob));
}
