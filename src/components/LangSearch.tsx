import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
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

/**
 * The grid's "+ Language": a dashed pill that opens a compact searchable list,
 * laid out like the bible-version picker (search field on top, code left and
 * name right). Typing filters; arrow keys and Enter pick; Escape closes.
 */
export function LangPickerMenu({
  available,
  onAdd,
  label,
}: {
  available: readonly LangDef[];
  onAdd: (code: LangCode) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(
    () => pickerOrder(available.filter((l) => langMatches(l, query))),
    [available, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(-1);
    inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const pick = (code: LangCode) => {
    onAdd(code);
    setOpen(false);
  };

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mono flex h-7 items-center justify-center gap-1 rounded-full border border-dashed px-3 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        {label}
      </button>
      {open && (
        <div
          ref={listRef}
          onMouseDown={(e) => {
            if (e.target !== inputRef.current) e.preventDefault();
          }}
          className="catalogue-scroll absolute left-0 z-50 mt-1 max-h-60 w-64 overflow-auto rounded-2xl border border-foreground bg-popover shadow-md"
        >
          <div className="sticky top-0 z-10 border-b border-foreground/20 bg-popover">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(matches.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const l = matches[Math.max(0, active)];
                  if (l) pick(l.code);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder="Search languages"
              aria-label="Search languages"
              className="mono w-full bg-transparent px-3 py-2 text-xs uppercase outline-none placeholder:text-muted-foreground"
            />
          </div>
          {matches.map((l, i) => (
            <button
              key={l.code}
              type="button"
              data-active={i === active}
              onClick={() => pick(l.code)}
              onMouseMove={() => setActive(i)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${i === active ? "bg-muted" : ""}`}
            >
              <span className="mono flex shrink-0 items-center gap-2 text-xs uppercase">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: langColor(l.code) }}
                />
                {l.short}
              </span>
              <span className="mono truncate text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                {l.label}
              </span>
            </button>
          ))}
          {matches.length === 0 && (
            <div className="mono px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              No languages match
            </div>
          )}
        </div>
      )}
    </div>
  );
}
