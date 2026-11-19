import { describe, expect, it } from "vitest";
import {
  cleanSongLyrics,
  inlineTrailingChords,
  labelLine,
  snapLineStarts,
  splitGlued,
  splitLongLines,
  stripDirections,
} from "../song-db-clean";

describe("cleanSongLyrics: None But Jesus (the reported song)", () => {
  const before = [
    "[Verse 1]",
    "Intro C F x2",
    "(C)In the quiet (F)in the stillness",
    "",
    "[Chorus]",
    "There is no one (F)else (C)for (G)me(Dm)None but (Am)Jesus",
    "Crucified to (F)set (C)me (G)free",
    "Now I live to bring Him praise F G C Em7 Am x2",
    "",
    "[Verse 2]",
    "This my song through all my days > chorus x2",
    "",
    "[Bridge]",
    "(Am7)All my (F)delight is (C)in You (G)LordAll of my (Dm)hope all of my (Am)strength",
    "Forever (Dm)more (Am)x2 >chorus x2",
  ].join("\n");

  it("drops the intro notation, splits the glued lines, makes the letters real chords and removes the repeats", () => {
    expect(cleanSongLyrics(before)).toBe(
      [
        "[Verse 1]",
        "(C)In the quiet (F)in the stillness",
        "",
        "[Chorus]",
        "There is no one (F)else (C)for (G)me",
        "(Dm)None but (Am)Jesus",
        "Crucified to (F)set (C)me (G)free",
        "Now I live to bring Him praise (F)(G)(C)(Em7)(Am)",
        "",
        "[Verse 2]",
        "This my song through all my days",
        "",
        "[Bridge]",
        "(Am7)All my (F)delight is (C)in You (G)Lord",
        "All of my (Dm)hope all of my (Am)strength",
        "Forever (Dm)more (Am)",
      ].join("\n"),
    );
  });

  it("leaves an already clean song exactly as it is", () => {
    const clean = "[Verse 1]\n(C)In the quiet (F)in the stillness\nI (Dm)know that You are (G)God";
    expect(cleanSongLyrics(clean)).toBe(clean);
  });
});

describe("stripDirections", () => {
  it.each([
    ["All we need is (C/G)You (2X)", "All we need is (C/G)You"],
    ["And unto us the Spirit bring [2X]", "And unto us the Spirit bring"],
    ["(D)Cover the earth with Your glory (back to verse)", "(D)Cover the earth with Your glory"],
    ["You hold my (Em)world in your (D)hands x3 >chorus", "You hold my (Em)world in your (D)hands"],
    ["(G)Surely He will (D)deliver [x2", "(G)Surely He will (D)deliver"],
    [
      "// (G)Be bold (be bold) be (C)strong (be strong)",
      "(G)Be bold (be bold) be (C)strong (be strong)",
    ],
    ["Humble thyself in the sight of the Lord (Echo)", "Humble thyself in the sight of the Lord"],
    ["honest in our hearts }2x", "honest in our hearts"],
  ])("%s", (line, expected) => {
    expect(stripDirections(line)).toBe(expected);
  });

  it("keeps echoes and asides that are sung", () => {
    expect(stripDirections("At the cross (at the cross)")).toBe("At the cross (at the cross)");
    expect(stripDirections("{First it was Fragrance")).toBe("First it was Fragrance");
  });
});

describe("labelLine", () => {
  it("turns section names typed as lyrics into sections", () => {
    expect(labelLine("VERSE 1")).toEqual({ section: "Verse 1" });
    expect(labelLine("Pre chorus")).toEqual({ section: "Pre-Chorus" });
    expect(labelLine("Bridge 2x")).toEqual({ section: "Bridge" });
    expect(labelLine("2X Bridge")).toEqual({ section: "Bridge" });
    expect(labelLine("CHORUS cont")).toEqual({ section: "Chorus" });
    expect(labelLine("Coda")).toEqual({ section: "Tag" });
  });

  it("drops intros and interludes, which are played, not sung", () => {
    expect(labelLine("Intro C F x2")).toEqual({ drop: true });
    expect(labelLine("Interlude (x2)")).toEqual({ drop: true });
  });

  it("leaves sung lines alone", () => {
    expect(labelLine("Chorus of angels singing")).toBeNull();
    expect(labelLine("Bridge over troubled water")).toBeNull();
  });
});

describe("inlineTrailingChords", () => {
  it("needs a run of two chords, so a sung 'I Am' stays", () => {
    expect(inlineTrailingChords("He is the great I Am")).toBe("He is the great I Am");
    expect(inlineTrailingChords("I'm (D)coming alive D Bm")).toBe("I'm (D)coming alive (D)(Bm)");
  });
});

describe("splitGlued", () => {
  it("breaks two lines typed as one, keeping the chord with its word", () => {
    expect(splitGlued("Be magnified O LordYou are highly exalted")).toEqual([
      "Be magnified O Lord",
      "You are highly exalted",
    ]);
    expect(splitGlued("for (G)me(Dm)None but")).toEqual(["for (G)me", "(Dm)None but"]);
  });

  it("leaves names like McClure alone", () => {
    expect(splitGlued("Sing with McClure")).toEqual(["Sing with McClure"]);
  });
});

describe("splitLongLines", () => {
  it("splits one-line hymn verses back into their lines, using the meter all verses share", () => {
    const verses = [
      "Immortal invisible God only wise In light inaccessible hid from our eyes Most blessèd most glorious the Ancient of Days Almighty victorious Thy great Name we praise",
      "Unresting unhasting and silent as light Nor wanting nor wasting Thou rulest in might Thy justice like mountains high soaring above Thy clouds which are fountains of goodness and love",
    ];
    expect(splitLongLines(verses)).toEqual([
      [
        "Immortal invisible God only wise",
        "In light inaccessible hid from our eyes",
        "Most blessèd most glorious the Ancient of Days",
        "Almighty victorious Thy great Name we praise",
      ],
      [
        "Unresting unhasting and silent as light",
        "Nor wanting nor wasting Thou rulest in might",
        "Thy justice like mountains high soaring above",
        "Thy clouds which are fountains of goodness and love",
      ],
    ]);
  });

  it("moves a stranded first word down to its line", () => {
    expect(
      snapLineStarts([
        "Where shall we for succor flee",
        "Lest our foes confound us To",
        "Thee alone our Savior",
      ]),
    ).toEqual([
      "Where shall we for succor flee",
      "Lest our foes confound us",
      "To Thee alone our Savior",
    ]);
  });
});

describe("hand fixes", () => {
  it("replaces or drops the exact lines listed for a song", () => {
    const fixes = { Song: { "MAN(WOMEN)": null, "It'sChristmas": "It's Christmas" } };
    expect(cleanSongLyrics("[Chorus]\nMAN(WOMEN)\nIt'sChristmas", "Song", fixes)).toBe(
      "[Chorus]\nIt's Christmas",
    );
  });
});
