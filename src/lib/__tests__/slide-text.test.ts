import { describe, expect, it } from "vitest";
import {
  lyricsToSlides,
  parseScriptureFromText,
  reconcileSlideIds,
  slidesToLyricsText,
  slidesToScriptureText,
} from "@/lib/slide-text";

const LYRICS = [
  "[Verse 1]",
  "Amazing grace, how sweet the sound",
  "That saved a wretch like me",
  "---",
  "I once was lost, but now am found",
  "Was blind but now I see",
  "---",
  "[Chorus]",
  "My chains are gone, I've been set free",
].join("\n");

const SCRIPTURE = [
  "[John 3:16]",
  "For God so loved the world…",
  "---",
  "[John 3:17]",
  "For God did not send his Son…",
  "---",
  "…but to save the world through him.",
].join("\n");

describe("lyrics round-trip (regression: opening the editor must not rewrite slides)", () => {
  it("slides → text → slides reconciles to the exact stored objects, ids intact", () => {
    const stored = lyricsToSlides(LYRICS);
    const reparsed = lyricsToSlides(slidesToLyricsText(stored));
    const { slides, changed } = reconcileSlideIds(reparsed, stored);
    expect(changed).toBe(false);
    // Same objects, not lookalikes — ids (and references) fully preserved.
    slides.forEach((s, i) => expect(s).toBe(stored[i]));
  });

  it("keeps section inheritance stable across the round-trip", () => {
    const stored = lyricsToSlides(LYRICS);
    // Slide 2 carries "Verse 1" by inheritance, not an explicit header.
    expect(stored.map((s) => s.section)).toEqual(["Verse 1", "Verse 1", "Chorus"]);
    const reparsed = lyricsToSlides(slidesToLyricsText(stored));
    expect(reparsed.map((s) => s.section)).toEqual(["Verse 1", "Verse 1", "Chorus"]);
  });
});

describe("scripture round-trip", () => {
  it("slides → text → slides reconciles to the exact stored objects, ids intact", () => {
    const stored = parseScriptureFromText(SCRIPTURE, 1);
    const reparsed = parseScriptureFromText(slidesToScriptureText(stored), 1);
    const { slides, changed } = reconcileSlideIds(reparsed, stored);
    expect(changed).toBe(false);
    slides.forEach((s, i) => expect(s).toBe(stored[i]));
  });

  it("is stable even when versesPer differs from creation time (--- dominates)", () => {
    const stored = parseScriptureFromText(SCRIPTURE, 2);
    // Re-parse with the editor's default versesPer of 1, as happens on open.
    const reparsed = parseScriptureFromText(slidesToScriptureText(stored), 1);
    expect(reconcileSlideIds(reparsed, stored).changed).toBe(false);
  });
});

describe("reconcileSlideIds", () => {
  it("gives only the actually-edited slide a new id", () => {
    const stored = lyricsToSlides(LYRICS);
    const edited = slidesToLyricsText(stored).replace("was lost", "was found?!");
    const { slides, changed } = reconcileSlideIds(lyricsToSlides(edited), stored);
    expect(changed).toBe(true);
    expect(slides[0]).toBe(stored[0]);
    expect(slides[1].id).not.toBe(stored[1].id);
    expect(slides[2]).toBe(stored[2]);
  });

  it("flags a genuine clear as changed", () => {
    const stored = lyricsToSlides(LYRICS);
    const { slides, changed } = reconcileSlideIds([], stored);
    expect(changed).toBe(true);
    expect(slides).toEqual([]);
  });

  it("treats empty vs empty as unchanged (unhydrated store on first render)", () => {
    expect(reconcileSlideIds([], []).changed).toBe(false);
  });

  it("flags added slides as changed while preserving the untouched prefix", () => {
    const stored = lyricsToSlides(LYRICS);
    const longer = lyricsToSlides(slidesToLyricsText(stored) + "\n---\nNew final slide");
    const { slides, changed } = reconcileSlideIds(longer, stored);
    expect(changed).toBe(true);
    expect(slides.slice(0, stored.length)).toEqual(stored);
    expect(slides).toHaveLength(stored.length + 1);
  });
});
