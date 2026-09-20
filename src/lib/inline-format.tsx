// Inline emphasis for slide text: bold, italic and underline, typed into the
// text boxes with the usual shortcuts (Cmd/Ctrl + B / I / U) and stored as
// light markup in the text itself, so it survives sync, export and the phone
// view without a second field:
//
//   **bold**   *italic*   __underline__
//
// Markers nest (underline outermost, then bold, then italic: the editor writes
// them in that one order whatever order they were applied in).

import { Fragment, type ReactNode } from "react";

// "***" (bold italic) is its own token so the parser never has to decide
// whether "***x***" opens with "**" or "*".
const MARKERS = [
  { token: "***", tag: "strong-em" },
  { token: "**", tag: "strong" },
  { token: "__", tag: "u" },
  { token: "*", tag: "em" },
] as const;

type Tag = (typeof MARKERS)[number]["tag"];

/** The text with every marker removed (search, previews, copying). */
export function stripInlineFormat(text: string): string {
  return text.replace(/\*{1,3}|__/g, "");
}

/** Does the text carry any marker at all? Cheap gate for the renderer. */
export function hasInlineFormat(text: string): boolean {
  return /\*\*|__|\*/.test(text);
}

/**
 * Render the text as React nodes with <strong>, <em> and <u>. Unmatched
 * markers are shown as typed, so a stray asterisk never eats the line.
 */
export function renderInline(text: string): ReactNode {
  if (!hasInlineFormat(text)) return text;
  return (
    <>
      {parse(text, 0).map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  );
}

function parse(text: string, depth: number): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) out.push(plain);
    plain = "";
  };
  while (i < text.length) {
    const m = depth < 3 ? MARKERS.find((k) => text.startsWith(k.token, i)) : undefined;
    if (m) {
      // The matching closer must exist, after at least one character.
      const close = text.indexOf(m.token, i + m.token.length + 1);
      if (close !== -1) {
        flush();
        const inner = text.slice(i + m.token.length, close);
        out.push(wrap(m.tag, parse(inner, depth + 1), out.length));
        i = close + m.token.length;
        continue;
      }
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

function wrap(tag: Tag, children: ReactNode[], key: number): ReactNode {
  const body = children.map((c, i) => <Fragment key={i}>{c}</Fragment>);
  if (tag === "strong") return <strong key={key}>{body}</strong>;
  if (tag === "em") return <em key={key}>{body}</em>;
  if (tag === "strong-em")
    return (
      <strong key={key}>
        <em>{body}</em>
      </strong>
    );
  return <u key={key}>{body}</u>;
}

// ---------------------------------------------------------------------------
// Rich-text cells. The boxes in the scripture/message editors are
// contentEditable, so formatting is applied in the DOM (the browser nests
// <b>/<i>/<u> properly whatever order they're toggled in) and the DOM is
// serialised back to markup in ONE canonical form on every edit (see
// runsToMarkup), so the stored text is clean regardless of how it was typed.
// ---------------------------------------------------------------------------

export type Styles = { b: boolean; i: boolean; u: boolean };
type Run = { text: string; s: Styles };

const escapeHtml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Markup to HTML for a contentEditable box. Newlines become <br>. */
export function markupToHtml(markup: string): string {
  const runs = markupToRuns(markup);
  return runs
    .map(({ text, s }) => {
      let h = escapeHtml(text).replace(/\n/g, "<br>");
      if (s.i) h = `<i>${h}</i>`;
      if (s.b) h = `<b>${h}</b>`;
      if (s.u) h = `<u>${h}</u>`;
      return h;
    })
    .join("");
}

/** Parse markup into styled runs (the same grammar renderInline uses). */
export function markupToRuns(markup: string): Run[] {
  const runs: Run[] = [];
  const walk = (text: string, s: Styles, depth: number) => {
    let i = 0;
    let plain = "";
    const flush = () => {
      if (plain) runs.push({ text: plain, s });
      plain = "";
    };
    while (i < text.length) {
      const m = depth < 3 ? MARKERS.find((k) => text.startsWith(k.token, i)) : undefined;
      if (m) {
        const close = text.indexOf(m.token, i + m.token.length + 1);
        if (close !== -1) {
          flush();
          const inner = text.slice(i + m.token.length, close);
          const ns = { ...s };
          if (m.tag === "strong") ns.b = true;
          else if (m.tag === "em") ns.i = true;
          else if (m.tag === "strong-em") ns.b = ns.i = true;
          else ns.u = true;
          walk(inner, ns, depth + 1);
          i = close + m.token.length;
          continue;
        }
      }
      plain += text[i];
      i += 1;
    }
    flush();
  };
  walk(markup, { b: false, i: false, u: false }, 0);
  return mergeRuns(runs);
}

function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.s.b === r.s.b && last.s.i === r.s.i && last.s.u === r.s.u) last.text += r.text;
    else out.push({ text: r.text, s: { ...r.s } });
  }
  return out;
}

/** Runs back to canonical markup: an underlined stretch is one "__…__"
 *  (so its spaces stay underlined), and inside or outside it each run is
 *  "***x***", "**x**", "*x*" or plain. Bold and italic never nest, which is
 *  what keeps "**" and "*" unambiguous to parse. */
export function runsToMarkup(runs: Run[]): string {
  const emphasis = ({ text, s }: Run) =>
    s.b && s.i ? `***${text}***` : s.b ? `**${text}**` : s.i ? `*${text}*` : text;
  let out = "";
  let group = "";
  const closeGroup = () => {
    if (group) out += `__${group}__`;
    group = "";
  };
  for (const r of mergeRuns(runs)) {
    if (r.s.u) group += emphasis(r);
    else {
      closeGroup();
      out += emphasis(r);
    }
  }
  closeGroup();
  return out;
}

/** A contentEditable box's DOM to canonical markup. <b>/<strong>, <i>/<em>,
 *  <u> (and the equivalent inline styles browsers sometimes emit) become
 *  styles; <br> and block boundaries become newlines. */
export function htmlToMarkup(root: HTMLElement): string {
  const runs: Run[] = [];
  const walk = (node: Node, s: Styles) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? "";
      if (t) runs.push({ text: t, s });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "br") {
      runs.push({ text: "\n", s });
      return;
    }
    const ns = { ...s };
    const style = node.style;
    if (
      tag === "b" ||
      tag === "strong" ||
      style.fontWeight === "bold" ||
      Number(style.fontWeight) >= 600
    )
      ns.b = true;
    if (tag === "i" || tag === "em" || style.fontStyle === "italic") ns.i = true;
    if (tag === "u" || style.textDecoration.includes("underline")) ns.u = true;
    const block = tag === "div" || tag === "p";
    // A block after other content starts on a new line.
    if (block && runs.length && !runs[runs.length - 1].text.endsWith("\n")) {
      runs.push({ text: "\n", s });
    }
    node.childNodes.forEach((c) => walk(c, ns));
  };
  root.childNodes.forEach((c) => walk(c, { b: false, i: false, u: false }));
  // A trailing <br> the browser adds to keep the box open isn't content.
  const markup = runsToMarkup(runs);
  return markup.replace(/\n$/, "");
}

/** The plain-text length of markup (markers don't count). */
export function plainLength(markup: string): number {
  return stripInlineFormat(markup).length;
}

/** Markup split at a plain-text offset, each side with its own well-formed
 *  markers (splitting "**bo|ld**" gives "**bo**" and "**ld**"). */
export function splitMarkup(markup: string, plainAt: number): [string, string] {
  const head: Run[] = [];
  const tail: Run[] = [];
  let n = 0;
  for (const r of markupToRuns(markup)) {
    const end = n + r.text.length;
    if (end <= plainAt) head.push(r);
    else if (n >= plainAt) tail.push(r);
    else {
      head.push({ text: r.text.slice(0, plainAt - n), s: r.s });
      tail.push({ text: r.text.slice(plainAt - n), s: r.s });
    }
    n = end;
  }
  return [runsToMarkup(head), runsToMarkup(tail)];
}
