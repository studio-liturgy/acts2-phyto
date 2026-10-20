import { ROLE_LABEL, ROLE_LETTER, type Role } from "@/lib/song-roles";

/** Show role: the small grey L / P at the start of a reader's run. */
export function RoleMark({ role }: { role: Role }) {
  return (
    <sup className="mr-[0.3em] font-normal opacity-50" aria-label={ROLE_LABEL[role]}>
      {ROLE_LETTER[role]}
    </sup>
  );
}
