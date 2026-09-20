import { describe, expect, it } from "vitest";
import { cleanVerseText } from "@/lib/bible";

const o = { removeLineBreaks: true, superscription: true };

describe("psalm superscriptions are dropped from verse 1", () => {
  it("NIV: title line and note before the verse", () => {
    expect(
      cleanVerseText(
        "Psalm 5<br/>For the director of music. For flutes. A psalm of David.<br/>Give ear to my words, O Lord,<br/>consider my sighing.",
        o,
      ),
    ).toBe("Give ear to my words, O Lord, consider my sighing.");
  });

  it("NIV: the five-book division and title ahead of a psalm's first words", () => {
    expect(
      cleanVerseText(
        "BOOK I<br/>Psalms 1–41<br/>Psalm 1<br/>Blessed is the man<br/>who does not walk in the counsel of the wicked",
        o,
      ),
    ).toBe("Blessed is the man who does not walk in the counsel of the wicked");
    expect(
      cleanVerseText(
        "BOOK II<br/>Psalms 42–72<br/>Psalm 42<br/>For the director of music. A maskil of the Sons of Korah.<br/>As the deer pants for streams of water,",
        o,
      ),
    ).toBe("As the deer pants for streams of water,");
  });

  it("NKJV: italic note", () => {
    expect(
      cleanVerseText(
        "<i>To the Chief Musician. With flutes. A Psalm of David.</i>  </i> Give ear to my words, O LORD, Consider my meditation.",
        o,
      ),
    ).toBe("Give ear to my words, O LORD, Consider my meditation.");
  });

  it("CUNPS: bracketed note then a break; CUV: bracketed note inline", () => {
    expect(
      cleanVerseText(
        "〔大卫的诗，交与伶长。用吹的乐器。〕<br/>耶和华啊，求你留心听我的言语，顾念我的心思！<br/>",
        o,
      ),
    ).toBe("耶和华啊，求你留心听我的言语，顾念我的心思！");
    expect(
      cleanVerseText(
        "（ 大 衛 的 詩 ， 交 與 伶 長 。 ） 耶 和 華 啊 ， 求 你 留 心 聽 我 的 言 語 ！",
        o,
      ),
    ).toBe("耶 和 華 啊 ， 求 你 留 心 聽 我 的 言 語 ！");
  });

  it("leaves a verse alone outside a psalm's first verse, and italic supplied words", () => {
    expect(
      cleanVerseText("(although in fact it was not Jesus who baptized)", {
        removeLineBreaks: true,
      }),
    ).toBe("(although in fact it was not Jesus who baptized)");
    expect(cleanVerseText("<i>Blessed</i> is the man", o)).toBe("Blessed is the man");
  });
});

describe("other translations' headings", () => {
  it("NTV: inline book division and title", () => {
    expect(
      cleanVerseText(
        "LIBRO PRIMERO (Salmos 1–41) Salmo 1 Qué alegría para los que <br>no siguen",
        o,
      ),
    ).toBe("Qué alegría para los que no siguen");
    expect(
      cleanVerseText(
        "LIBRO SEGUNDO (Salmos 42–72) Salmo 42 Como el ciervo anhela, <br>así te anhelo.<br>",
        o,
      ),
    ).toBe("Como el ciervo anhela, así te anhelo.");
  });

  it("PDT: centred paragraph headings, and the note", () => {
    expect(
      cleanVerseText(
        "'<p align='center'><b><i>Libro 1</i></b></p><p align='center'><b><i>Justos y pecadores</i></b></p>Afortunado el que no sigue el consejo.'",
        o,
      ),
    ).toBe("'Afortunado el que no sigue el consejo.'");
  });

  it("JPKJV: furigana superscripts go, and the book division", () => {
    expect(
      cleanVerseText(
        "<i>第</i><sup>,だい</sup><i>一</i><sup>,いっ</sup><i>巻</i><sup>,かん</sup><i>悪</i><sup>,あ</sup>しき<i>者</i><sup>,もの</sup>のはかりごとに",
        o,
      ),
    ).toBe("悪しき者のはかりごとに");
    // Furigana are stripped in every verse, not only a psalm's first.
    expect(cleanVerseText("<i>神</i><sup>,かみ</sup>は", { removeLineBreaks: true })).toBe("神は");
  });
});
