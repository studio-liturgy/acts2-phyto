// Inline emphasis for slide text: bold, italic and underline, typed into the
// text boxes with the usual shortcuts (Cmd/Ctrl + B / I / U) and stored as
// light markup in the text itself, so it survives sync, export and the phone
// view without a second field:
//
//   **bold**   *italic*   __underline__
//
// Markers may nest one level (a bold phrase inside an underlined one), which
// is as far as a slide ever needs.

import { Fragment, type ReactNode } from "react";

const MARKERS = [
  { token: "**", tag: "strong" },
  { token: "__", tag: "u" },
  { token: "*", tag: "em" },
] as const;

type Tag = (typeof MARKERS)[number]["tag"];

/** The text with every marker removed (search, previews, copying). */
export function stripInlineFormat(text: string): string {
  return text.replace(/\*\*|__|\*/g, "");
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
    const m = depth < 2 ? MARKERS.find((k) => text.startsWith(k.token, i)) : undefined;
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
  return <u key={key}>{body}</u>;
}

/**
 * Handle Cmd/Ctrl + B / I / U in a text box: wrap the selection in the marker
 * (or unwrap it when it already is), keeping the selection. With nothing
 * selected, insert a marker pair and put the caret between them. Returns the
 * new value, or null when the key wasn't a formatting shortcut.
 */
export function applyFormatShortcut(
  e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
): string | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const token =
    e.key === "b" || e.key === "B"
      ? "**"
      : e.key === "i" || e.key === "I"
        ? "*"
        : e.key === "u" || e.key === "U"
          ? "__"
          : null;
  if (!token) return null;
  e.preventDefault();
  const el = e.currentTarget;
  const value = el.value;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? start;
  const selected = value.slice(start, end);
  const n = token.length;

  let next: string;
  let selStart: number;
  let selEnd: number;
  if (selected.startsWith(token) && selected.endsWith(token) && selected.length >= 2 * n) {
    // Selected with its markers: unwrap.
    const inner = selected.slice(n, selected.length - n);
    next = value.slice(0, start) + inner + value.slice(end);
    selStart = start;
    selEnd = start + inner.length;
  } else if (value.slice(start - n, start) === token && value.slice(end, end + n) === token) {
    // Markers just outside the selection: unwrap.
    next = value.slice(0, start - n) + selected + value.slice(end + n);
    selStart = start - n;
    selEnd = selStart + selected.length;
  } else {
    next = value.slice(0, start) + token + selected + token + value.slice(end);
    selStart = start + n;
    selEnd = selStart + selected.length;
  }
  // Restore the selection once React has re-rendered the new value.
  requestAnimationFrame(() => {
    try {
      el.setSelectionRange(selStart, selEnd);
    } catch {
      // detached
    }
  });
  return next;
}
