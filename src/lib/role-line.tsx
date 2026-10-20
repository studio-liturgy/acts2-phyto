import type { ReactNode } from "react";
import { renderInline } from "./inline-format";
import { ROLE_LABEL, isBoldRole, splitRole } from "./song-roles";

/**
 * One lyric line as it shows on a slide or a phone: a Call and Response line
 * keeps its "People:" label in front, and People and All lines are bold. Any
 * other line renders exactly as before.
 */
export function renderRoleLine(
  line: string,
  render: (text: string) => ReactNode = renderInline,
): ReactNode {
  const { role, text } = splitRole(line);
  if (!role) return render(line);
  return (
    <>
      <span>{ROLE_LABEL[role]}: </span>
      <span className={isBoldRole(role) ? "font-bold" : undefined}>{render(text)}</span>
    </>
  );
}
