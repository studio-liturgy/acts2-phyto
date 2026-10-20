import type { ReactNode } from "react";
import { renderInline } from "./inline-format";
import { ROLE_LABEL, isBoldRole, type Role } from "./song-roles";

/**
 * One lyric line as it shows on a slide: a Call and Response line gets its
 * "People:" label in front (unless Hide Role), and People lines are bold. A line with no
 * role renders exactly as before.
 */
export function renderRoleLine(
  line: string,
  role: Role | null | undefined,
  hideName = false,
): ReactNode {
  if (!role) return renderInline(line);
  return (
    <>
      {!hideName && <span>{ROLE_LABEL[role]}: </span>}
      <span className={isBoldRole(role) ? "font-bold" : undefined}>{renderInline(line)}</span>
    </>
  );
}
