import { describe, expect, it } from "vitest";
import { photoAccept, withMediaType } from "../media";

describe("photoAccept", () => {
  it("lists only picture (and video) types, so the app opens the photo library", () => {
    expect(
      photoAccept(false)
        .split(",")
        .every((t) => t.startsWith("image/")),
    ).toBe(true);
    expect(photoAccept(true)).toContain("video/mp4");
    expect(photoAccept(true)).not.toContain("pdf");
  });
});

describe("withMediaType", () => {
  it("fills a blank or generic type from the file name", () => {
    expect(withMediaType(new File(["x"], "Slides.PDF")).type).toBe("application/pdf");
    expect(withMediaType(new File(["x"], "a.jpg", { type: "application/octet-stream" })).type).toBe(
      "image/jpeg",
    );
  });

  it("keeps a real type and leaves unknown files alone", () => {
    const png = new File(["x"], "a.jpg", { type: "image/png" });
    expect(withMediaType(png)).toBe(png);
    expect(withMediaType(new File(["x"], "notes.txt")).type).toBe("");
  });
});
