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
    let reference: string | undefined;
    const headerMatch = rawLines[0]?.match(/^\[?(verse\s*\d*|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude)\]?$/i);
    let lines = rawLines;
    if (headerMatch) {
      reference = rawLines[0].replace(/[\[\]]/g, "");
      lines = rawLines.slice(1);
    }
    if (lines.length === 0) continue;
    for (let i = 0; i < lines.length; i += linesPerSlide) {
      slides.push({
        id: uid(),
        kind: "lyric",
        lines: lines.slice(i, i + linesPerSlide),
        reference: i === 0 ? reference : undefined,
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
  verses: { verse: number; text: string }[],
  versesPerSlide = 1
): Slide[] {
  const slides: Slide[] = [];
  for (let i = 0; i < verses.length; i += versesPerSlide) {
    const chunk = verses.slice(i, i + versesPerSlide);
    slides.push({
      id: uid(),
      kind: "scripture",
      lines: chunk.map((v) => `${v.verse}. ${v.text}`),
      reference: ref,
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
