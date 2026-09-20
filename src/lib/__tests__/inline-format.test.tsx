import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  hasInlineFormat,
  htmlToMarkup,
  markupToHtml,
  plainLength,
  renderInline,
  splitMarkup,
  stripInlineFormat,
} from "@/lib/inline-format";

const html = (t: string) => renderToStaticMarkup(<>{renderInline(t)}</>);

describe("inline format", () => {
  it("renders bold, italic and underline", () => {
    expect(html("For **God** so *loved* the __world__")).toBe(
      "For <strong>God</strong> so <em>loved</em> the <u>world</u>",
    );
  });

  it("nests one level and leaves stray markers alone", () => {
    expect(html("__a **b** c__")).toBe("<u>a <strong>b</strong> c</u>");
    expect(html("2 * 3 = 6")).toBe("2 * 3 = 6");
    expect(html("plain")).toBe("plain");
  });

  it("strips markers for plain-text uses", () => {
    expect(stripInlineFormat("**a** _b_ __c__ *d*")).toBe("a _b_ c d");
    expect(hasInlineFormat("nothing here")).toBe(false);
  });
});

describe("rich-text cells", () => {
  const cell = (innerHTML: string) => {
    const el = document.createElement("div");
    el.innerHTML = innerHTML;
    return el;
  };

  it("serialises the DOM to one canonical marker order whatever the nesting", () => {
    // Bold then underline, or underline then bold: the same markup.
    expect(htmlToMarkup(cell("<b><u>x</u></b>"))).toBe("__**x**__");
    expect(htmlToMarkup(cell("<u><b>x</b></u>"))).toBe("__**x**__");
    expect(htmlToMarkup(cell("<i><b><u>x</u></b></i>"))).toBe("__***x***__");
    // Split runs with the same styling merge.
    expect(htmlToMarkup(cell("<b>ab</b><b>cd</b>"))).toBe("**abcd**");
    // Browser-style spans count too.
    expect(htmlToMarkup(cell('<span style="font-weight: bold">x</span>'))).toBe("**x**");
  });

  it("keeps an underlined stretch as one span and honours line breaks", () => {
    expect(htmlToMarkup(cell("<u>a <b>b</b> c</u>"))).toBe("__a **b** c__");
    expect(htmlToMarkup(cell("<u><i>a</i> <b><i>b</i></b></u>"))).toBe("__*a* ***b***__");
    expect(htmlToMarkup(cell("a<br>b"))).toBe("a\nb");
    expect(htmlToMarkup(cell("a<br><br>"))).toBe("a\n");
    expect(htmlToMarkup(cell("<br>"))).toBe("");
    expect(htmlToMarkup(cell("a<div>b</div>"))).toBe("a\nb");
  });

  it("round-trips markup through HTML", () => {
    for (const m of ["For **God** so *loved*", "__a **b** c__", "one\ntwo", "plain", "", "2 * 3"]) {
      expect(htmlToMarkup(cell(markupToHtml(m)))).toBe(m);
    }
    expect(markupToHtml("a <b> c")).toBe("a &lt;b&gt; c");
  });

  it("renders three levels", () => {
    expect(html("__***x***__")).toBe("<u><strong><em>x</em></strong></u>");
  });

  it("splits markup at a plain offset with well-formed halves", () => {
    expect(splitMarkup("**bold** text", 2)).toEqual(["**bo**", "**ld** text"]);
    expect(splitMarkup("a __b__ c", 3)).toEqual(["a __b__", " c"]);
    expect(splitMarkup("plain", 0)).toEqual(["", "plain"]);
    expect(plainLength("**bold** __u__")).toBe(6);
  });
});
