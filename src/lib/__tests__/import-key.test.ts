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

  // Worth stating rather than hiding: inference needs enough of a song to see
  // where the harmony settles. The chorus of 10,000 Reasons on its own is
  // C-heavy and reads as C. This is why a pasted chord sheet, which carries no
  // key tag, prompts the leader to check the key, while a library song never
  // has to be inferred at all.
  it("is not reliable on a short excerpt, which is why the tag is preferred", () => {
    const chorusOnly = [
      "Bless the (C)Lord O my (G)soul",
      "(D/F#)O my (Em)soul",
      "(C)Worship His (G)holy (D)name",
    ].join("\n");
    expect(guessKey(chorusOnly)).toBe("C");
  });
});
