// Media ready before it's shown, for the Stage Output window and the screen
// link. A slide's image (or its video's poster, or the backdrop) used to be
// fetched and decoded only when the slide went live, so it painted in while
// the audience watched. Now the slides around the live one are fetched and
// decoded ahead of time, and a dissolve waits (briefly) for its incoming
// image to be decoded before it starts.

import type { Background, Set as PhytoSet, Slide } from "./types";

/** YouTube's thumbnail for a video id (the poster a YouTube slide shows). */
export function youtubePosterUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** The pictures a slide paints: its own image, else the backdrop behind it,
 *  plus a YouTube slide's poster. */
export function slideImageUrls(slide: Slide, background?: Background): string[] {
  const out: string[] = [];
  if (slide.imageUrl) out.push(slide.imageUrl);
  else if (background?.bgImage) out.push(background.bgImage);
  if (slide.kind === "video" && slide.videoSource === "youtube" && slide.youtubeId) {
    out.push(youtubePosterUrl(slide.youtubeId));
  }
  return out;
}

/** Every picture and video file the given sets can show, without repeats. */
export function setsMedia(
  sets: (PhytoSet | undefined)[],
  background?: Background,
): { images: string[]; videos: string[] } {
  const images = new Set<string>();
  const videos = new Set<string>();
  if (background?.bgImage) images.add(background.bgImage);
  for (const d of sets) {
    if (!d) continue;
    for (const s of d.slides) {
      for (const u of slideImageUrls(s, background)) images.add(u);
      if (s.kind === "video" && s.videoSource !== "youtube" && s.videoUrl) videos.add(s.videoUrl);
    }
  }
  return { images: [...images], videos: [...videos] };
}

/** The live set and the one after it in the gathering: whose video files
 *  are worth buffering now (pictures are cheap enough to fetch for all). */
export function setsAround(setIds: string[], liveSetId: string | null): string[] {
  if (!liveSetId) return setIds.slice(0, 1);
  const i = setIds.indexOf(liveSetId);
  if (i < 0) return [liveSetId];
  return [...new Set([liveSetId, ...(setIds[i + 1] ? [setIds[i + 1]] : [])])];
}

// Decoded pictures are held (the element kept alive) so the browser keeps
// the decoded bitmap, and painting the slide later is instant.
const held = new Map<string, HTMLImageElement>();
const ready = new Set<string>();
const loading = new Map<string, Promise<void>>();

/** Fetch and decode a picture once; resolves when it's ready (or failed). */
export function preloadImage(url: string): Promise<void> {
  if (typeof Image === "undefined" || ready.has(url)) return Promise.resolve();
  const busy = loading.get(url);
  if (busy) return busy;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  held.set(url, img);
  const p = img
    .decode()
    .catch(() => {})
    .then(() => {
      ready.add(url);
      loading.delete(url);
    });
  loading.set(url, p);
  return p;
}

/** Whether a picture is already decoded. */
export function imageReady(url: string): boolean {
  return ready.has(url);
}

/** Let go of held pictures that aren't in `keep` (a gathering ended). */
export function releaseImages(keep: Set<string>): void {
  for (const url of [...held.keys()]) {
    if (keep.has(url)) continue;
    held.delete(url);
    ready.delete(url);
  }
}

/** Resolves once every picture the slide paints is decoded, or after
 *  `maxMs`, whichever comes first, so a missing image never holds a slide. */
export function whenSlideReady(
  slide: Slide | null | undefined,
  background: Background | undefined,
  maxMs = 1500,
): Promise<void> | null {
  if (!slide) return null;
  const urls = slideImageUrls(slide, background).filter((u) => !ready.has(u));
  if (urls.length === 0) return null;
  return Promise.race([
    Promise.all(urls.map(preloadImage)).then(() => {}),
    new Promise<void>((r) => setTimeout(r, maxMs)),
  ]);
}
