import type { ReactNode } from "react";
import { renderInline } from "./inline-format";
import { isBoldRole, type Role } from "./song-roles";
import { RoleMark } from "@/components/RoleMark";

/**
 * One lyric line as it shows on a slide: People lines are bold, and with Show
 * role the first line of each reader's run gets its mark. A line with no role
 * renders exactly as before.
 */
export function renderRoleLine(
  line: string,
  role: Role | null | undefined,
  mark = false,
): ReactNode {
  if (!role) return renderInline(line);
  return (
    <span className={`relative ${isBoldRole(role) ? "font-bold" : ""}`}>
      {mark && <RoleMark role={role} />}
      {renderInline(line)}
    </span>
  );
}
