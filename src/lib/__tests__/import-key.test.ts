import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guessKey, normaliseKeyTag } from "../chords";

/**
 * The reported bug: import 10,000 Reasons with the chords toggle off, turn
 * chords on afterwards, and the key came out C instead of G.
 *
 * The song is published in G but opens on its IV chord ("Bless the (C)Lord"),
 * so inferring from the first chord gives C. The editor never even reached an
 * inference it could get right, though, because importing with the toggle off
 * threw away the library's own key tag — and that tag, not any inference, is
 * the part that is actually exact.
 *
 * Every chorded song the library ships now carries a key, so this inference is
 * only ever reached for a pasted sheet or hand-typed chords.
 */
describe("key on import", () => {
  it("takes the library's published key tag verbatim", () => {
    // Nothing is worked out from the chords here. This is the path that makes
    // imported library songs exact rather than probable.
    expect(normaliseKeyTag("G")).toBe("G");
    expect(normaliseKeyTag("Eb")).toBe("Eb");
    // Minor tags fold to the relative major, since numbers are reckoned from
    // the major scale.
    expect(normaliseKeyTag("Em")).toBe("G");
    expect(normaliseKeyTag("Am")).toBe("C");
    expect(normaliseKeyTag("f#m")).toBe("A");
    expect(normaliseKeyTag("nonsense")).toBe(null);
  });

  it("infers G for the real song, which opens on its IV chord", () => {
    const db = JSON.parse(readFileSync("public/songs-en.json", "utf-8")) as {
      title: string;
      lyrics: string;
      key?: string;
    }[];
    const song = db.find((s) => s.title === "10,000 Reasons");
    expect(song?.key).toBe("G");
    // Read against the whole song, the inference agrees with the tag. Returning
    // C — the first chord — is the bug coming back.
    expect(guessKey(song!.lyrics)).toBe("G");
  });

  it("infers the tonic for a song that does open on it", () => {
    expect(guessKey("(G)Amazing (C)grace how (D)sweet the (G)sound")).toBe("G");
  });

  it("returns null when there is nothing to go on", () => {
    expect(guessKey("no chords in this line at all")).toBe(null);
  });

  // Chord quality is what carries this. The chorus alone is C-heavy and opens
  // on C, so counting roots reads it as C — but a D major rules C out, because
  // the second degree of C is a D MINOR. Only G accommodates every chord with
  // the quality it actually has.
  it("uses chord quality to reject a key the roots alone would allow", () => {
    const chorusOnly = [
      "Bless the (C)Lord O my (G)soul",
      "(D/F#)O my (Em)soul",
      "(C)Worship His (G)holy (D)name",
    ].join("\n");
    expect(guessKey(chorusOnly)).toBe("G");
  });

  it("hears the difference a single chord's quality makes", () => {
    // Same roots both times. A major second degree means the key is a fourth
    // down; a minor one leaves it where it looks.
    expect(guessKey("(C)one (D)two (G)three")).toBe("G");
    expect(guessKey("(C)one (Dm)two (G)three")).toBe("C");
  });
});
