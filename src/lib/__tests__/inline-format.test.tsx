import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { hasInlineFormat, renderInline, stripInlineFormat } from "@/lib/inline-format";

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
