import type { ReactNode } from "react";

/**
 * The bar pinned to the bottom of an editor (song grids, scripture, message):
 * a thin top border, then the editor's buttons on the left and its shortcut
 * hints in faint small caps (on the right when there are buttons, else left).
 *
 * Put it last inside the editor's scrolling column, which must be a flex
 * column: `mt-auto` holds it at the bottom when the content is short, and
 * `sticky bottom-0` keeps it there when the content scrolls.
 */
export function EditorBar({ children, hints }: { children?: ReactNode; hints?: string[] }) {
  return (
    <div className="sticky bottom-0 z-20 mt-auto flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t bg-background px-4 py-2">
      {children}
      {hints && hints.length > 0 && (
        <p
          className={`mono text-[10px] uppercase tracking-wider opacity-40 ${children ? "ml-auto" : ""}`}
        >
          {hints.join(" · ")}
        </p>
      )}
    </div>
  );
}
