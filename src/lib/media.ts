// Shared media-upload constants used by both the client editor and the
// server-side R2 upload route. Kept dependency-free so importing it into the
// client bundle never drags in Worker-only code.

/** Hard cap on uploaded media size. Kept well within the Cloudflare Workers
 *  request-body limit; bump alongside that limit if larger clips are needed. */
export const MEDIA_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

/** Accepted video MIME types → file extension used in the R2 object key. */
export const VIDEO_EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** True if the file's MIME type is an accepted uploadable video. */
export function isUploadableVideo(type: string): boolean {
  return type.toLowerCase() in VIDEO_EXT_BY_TYPE;
}
