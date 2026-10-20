import type { ReactNode } from "react";
import { renderInline } from "./inline-format";
import { ROLE_LABEL, isBoldRole, type Role } from "./song-roles";

/**
 * One lyric line as it shows on a slide: a Call and Response line gets its
 * "People:" label in front, and People and All lines are bold. A line with no
 * role renders exactly as before.
 */
export function renderRoleLine(line: string, role: Role | null | undefined): ReactNode {
  if (!role) return renderInline(line);
  return (
    <>
      <span>{ROLE_LABEL[role]}: </span>
      <span className={isBoldRole(role) ? "font-bold" : undefined}>{renderInline(line)}</span>
    </>
  );
}
