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
