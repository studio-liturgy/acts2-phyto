// Shared media-upload constants used by both the client editor and the
// server-side R2 upload route. Kept dependency-free so importing it into the
// client bundle never drags in Worker-only code.

/** Hard cap on uploaded media size. Kept well within the Cloudflare Workers
 *  request-body limit; bump alongside that limit if larger clips are needed. */
export const MEDIA_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

/** Total stored media a single user may keep in R2, summed across all their
 *  uploads. Enforced server-side before each upload. */
export const MEDIA_USER_QUOTA_BYTES = 300 * 1024 * 1024; // 300 MB

/** Accepted video MIME types → file extension used in the R2 object key. */
export const VIDEO_EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Accepted image MIME types → file extension used in the R2 object key.
 *  Slide images live in R2 rather than inline in `sets.content`: a base64 data
 *  URL inflates the row by ~33% AND is re-sent on every viewer poll, which is
 *  what blew the Supabase egress budget. R2 is served from the CDN and does not
 *  count against it. */
export const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

/** Everything the upload route will accept, keyed by MIME type. */
export const UPLOAD_EXT_BY_TYPE: Record<string, string> = {
  ...VIDEO_EXT_BY_TYPE,
  ...IMAGE_EXT_BY_TYPE,
};

/** Per-file cap for images. Far below MEDIA_MAX_BYTES because slide images are
 *  downscaled to IMAGE_MAX_DIM before upload; anything near this is a bug. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Longest edge, in px, that a slide image is downscaled to before upload. */
export const IMAGE_MAX_DIM = 1920;

/** JPEG quality used when re-encoding slide images. */
export const IMAGE_QUALITY = 0.85;

/** True if the file's MIME type is an accepted uploadable video. */
export function isUploadableVideo(type: string): boolean {
  return type.toLowerCase() in VIDEO_EXT_BY_TYPE;
}

/** True if the file's MIME type is an accepted uploadable image. */
export function isUploadableImage(type: string): boolean {
  return type.toLowerCase() in IMAGE_EXT_BY_TYPE;
}
