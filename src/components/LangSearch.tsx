import { useState } from "react";
import { langColor, langMatches, pickerOrder, type LangCode, type LangDef } from "@/lib/langs";

/**
 * A searchable language list: a box to type in ("jap", "pinyin", "CN") above
 * the matching languages, in picker order (languages first, pronunciations
 * last). Enter picks the first match. Used by the "What language is this song
 * currently in?" step and the Multilanguage grid's "+ Language".
 */
export function LangSearchList({
  options,
  onPick,
  autoFocus = true,
  maxHeight = "18rem",
}: {
  options: readonly LangDef[];
  onPick: (code: LangCode) => void;
  autoFocus?: boolean;
  maxHeight?: string;
}) {
  const [query, setQuery] = useState("");
  const matches = pickerOrder(options.filter((l) => langMatches(l, query)));
  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            onPick(matches[0].code);
          }
        }}
        autoFocus={autoFocus}
        placeholder="Search languages"
        aria-label="Search languages"
        className="mono pill w-full border border-foreground bg-background px-4 py-2 text-xs uppercase tracking-wider outline-none"
      />
      <div className="mt-2 overflow-y-auto" style={{ maxHeight }}>
        {matches.length === 0 && (
          <p className="mono px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            No language matches
          </p>
        )}
        {matches.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => onPick(l.code)}
            className="flex min-h-10 w-full items-center gap-3 rounded-full px-3 text-left transition hover:bg-muted"
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: langColor(l.code) }}
            />
            <span className="mono shrink-0 text-xs uppercase">{l.short}</span>
            <span className="mono ml-auto text-right text-[10px] uppercase tracking-wider text-muted-foreground">
              {l.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
