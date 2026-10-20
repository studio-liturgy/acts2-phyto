import { ROLE_LABEL, ROLE_LETTER, type Role } from "@/lib/song-roles";

/**
 * Show role: the small grey L / P at the start of a reader's run. It hangs
 * off the left of the line, outside the text, so the run's lines stay aligned
 * with each other. Put it inside a `position: relative` inline wrapper around
 * the line's words.
 */
export function RoleMark({ role }: { role: Role }) {
  return (
    <sup
      className="absolute right-full top-0 mr-[0.3em] text-[0.42em] font-normal leading-none opacity-50"
      aria-label={ROLE_LABEL[role]}
    >
      {ROLE_LETTER[role]}
    </sup>
  );
}
