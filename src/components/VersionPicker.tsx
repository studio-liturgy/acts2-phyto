import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  canonicalVersion,
  searchTranslationGroups,
  translationEntry,
  versionAbbr,
  type TranslationGroup,
} from "@/lib/bible";

/**
 * The bible-version dropdown in the scripture importer: a pill that opens a
 * searchable list, the versions used in previous sets on top and then every
 * version grouped by language (as on watch). Typing filters by code, name or
 * language; arrow keys and Enter pick.
 */
export function VersionPicker({
  label,
  value,
  placeholder,
  open,
  setOpen,
  onPick,
  onClear,
  exclude,
  groups,
  recent = [],
}: {
  label: string;
  value: string;
  /** Shown when there's no value (the optional second version). */
  placeholder?: string;
  open: boolean;
  setOpen: (open: boolean | ((o: boolean) => boolean)) => void;
  onPick: (code: string) => void;
  /** When set, a "None" entry clears the value. */
  onClear?: () => void;
  /** A code to leave out (the other picker's choice). */
  exclude?: string;
  groups: TranslationGroup[];
  /** Versions used in previous sets, most recent first: listed above the
   *  groups while nothing is typed. */
  recent?: string[];
}) {
  const [query, setQuery] = useState("");
  // The row the arrow keys are on (-1: none yet); typing puts it on the first
  // match, so Enter picks that.
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Each opening starts from an empty search, focused so typing filters.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(-1);
    inputRef.current?.focus();
  }, [open]);

  // A set may carry a bolls code YouVersion took over ("NIV"): it's the same
  // version as YouVersion's, so compare by the canonical key.
  const current = canonicalVersion(value);
  const excluded = exclude ? canonicalVersion(exclude) : "";
  const sections = useMemo(() => {
    const searching = query.trim() !== "";
    const out: TranslationGroup[] = [];
    if (!searching && recent.length) {
      const keys = [...new Set(recent.map(canonicalVersion))];
      out.push({ language: "Recently used", translations: keys.map(translationEntry) });
    }
    out.push(...(searching ? searchTranslationGroups(groups, query) : groups));
    return out
      .map((g) => ({ ...g, translations: g.translations.filter((t) => t.code !== excluded) }))
      .filter((g) => g.translations.length > 0);
  }, [query, recent, groups, excluded]);
  const flat = useMemo(() => sections.flatMap((g) => g.translations), [sections]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const pick = (code: string) => {
    onPick(code);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = flat[Math.max(0, active)];
      if (t) pick(t.code);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  let index = -1;
  return (
    <div>
      <div className="mono mb-1 text-[10px] uppercase tracking-wider">{label}</div>
      <div
        className="relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
        }}
      >
        <div
          className="pill flex cursor-pointer items-center gap-2 border border-foreground bg-background px-3 py-2"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          tabIndex={0}
        >
          <span className="mono uppercase flex-1 truncate text-xs">
            {value ? versionAbbr(value) : placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </div>
        {open && (
          <div
            ref={listRef}
            // Clicks inside keep the focus in the search field (and the list open).
            onMouseDown={(e) => {
              if (e.target !== inputRef.current) e.preventDefault();
            }}
            className="catalogue-scroll absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-foreground bg-popover shadow-md"
          >
            <div className="sticky top-0 z-10 border-b border-foreground/20 bg-popover">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search versions"
                aria-label={`Search ${label}`}
                className="mono w-full bg-transparent px-3 py-2 text-xs uppercase outline-none placeholder:text-muted-foreground"
              />
            </div>
            {onClear && !query.trim() && (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className={`mono w-full px-3 py-2 text-left text-xs uppercase hover:bg-muted ${value === "" ? "bg-muted" : ""}`}
              >
                {placeholder ?? "None"}
              </button>
            )}
            {sections.map((group, gi) => (
              // Two languages may share an English name: key by position too.
              <Fragment key={`${gi}:${group.language}`}>
                {group.language && (
                  <div className="mono bg-muted/60 px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {group.language}
                  </div>
                )}
                {group.translations.map((t) => {
                  index += 1;
                  const i = index;
                  return (
                    <button
                      key={t.code}
                      type="button"
                      data-active={i === active}
                      onClick={() => pick(t.code)}
                      onMouseMove={() => setActive(i)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${i === active || t.code === current ? "bg-muted" : ""}`}
                    >
                      <span className="mono uppercase text-xs shrink-0">{t.abbr}</span>
                      <span className="mono uppercase text-[10px] tracking-wider text-muted-foreground truncate text-right">
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </Fragment>
            ))}
            {flat.length === 0 && (
              <div className="mono px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                No versions match
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
