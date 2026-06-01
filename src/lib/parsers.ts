import type { Slide } from "./types";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Parse pasted lyrics into slides.
 * - Blank lines split slides.
 * - A line like "[Chorus]" or "Verse 1" (at start of block) becomes that slide's reference.
 * - Optional `linesPerSlide` further subdivides each block.
 */
export function parseLyrics(text: string, linesPerSlide = 2): Slide[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const slides: Slide[] = [];
  for (const block of blocks) {
    const rawLines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let section: string | undefined;
    const headerMatch = rawLines[0]?.match(
      /^\[?(verse\s*\d*|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude|refrain)\]?:?$/i
    );
    let lines = rawLines;
    if (headerMatch) {
      section = rawLines[0].replace(/[\[\]:]/g, "").trim();
      lines = rawLines.slice(1);
    }
    if (lines.length === 0) continue;
    for (let i = 0; i < lines.length; i += linesPerSlide) {
      slides.push({
        id: uid(),
        kind: "lyric",
        lines: lines.slice(i, i + linesPerSlide),
        section: i === 0 ? section : undefined,
      });
    }
  }
  return slides;
}

/** Fetch scripture passage via bible-api.com (public, no key, KJV/WEB). */
export async function fetchScripture(
  reference: string,
  translation = "web"
): Promise<{ reference: string; verses: { verse: number; text: string }[] }> {
  const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${translation}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Verse not found");
  const data = await res.json();
  return {
    reference: data.reference as string,
    verses: (data.verses ?? []).map((v: { verse: number; text: string }) => ({
      verse: v.verse,
      text: (v.text as string).trim(),
    })),
  };
}

export function scriptureToSlides(
  ref: string,
  verses: { verse: number; chapter?: number; text: string }[],
  versesPerSlide = 1,
  opts: { keepLineBreaks?: boolean } = {}
): Slide[] {
  const perSlide = Math.min(3, Math.max(1, versesPerSlide));
  const keepLineBreaks = opts.keepLineBreaks ?? false;
  // Derive book name from the passage reference, e.g. "John 3:16-18" -> "John".
  const bookName = ref.match(/^(.+?)\s+\d/)?.[1]?.trim() ?? ref;
  const slides: Slide[] = [];
  for (let i = 0; i < verses.length; i += perSlide) {
    const chunk = verses.slice(i, i + perSlide);
    const lines = keepLineBreaks
      ? chunk.flatMap((v) => v.text.split("\n"))
      : [chunk.map((v) => v.text.replace(/\s*\n\s*/g, " ")).join(" ")];
    slides.push({
      id: uid(),
      kind: "scripture",
      lines,
      reference: ref,
      section: ref,
    });
  }
  return slides;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * Load + downscale an image to a JPEG data URL. Keeps storage small enough
 * to persist in localStorage and avoids memory issues with huge photos.
 */
export async function fileToCompressedImageDataUrl(
  file: File,
  maxDim = 1920,
  quality = 0.85
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read image: " + file.name));
      i.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longest > maxDim ? maxDim / longest : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
