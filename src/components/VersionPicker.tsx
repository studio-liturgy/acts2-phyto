import { ChevronDown } from "lucide-react";

type Translation = { code: string; label: string };
type Group = { language: string; translations: Translation[] };

/**
 * The bible-version dropdown in the scripture importer: a pill that opens a
 * grouped list (one heading per language, as on watch). A single ungrouped
 * list is passed with an empty language.
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
  groups: Group[];
}) {
  return (
    <div>
      <div className="mono mb-1 text-[10px] uppercase tracking-wider">{label}</div>
      <div className="relative">
        <div
          className="pill flex cursor-pointer items-center gap-2 border border-foreground bg-background px-3 py-2"
          onClick={() => setOpen((o) => !o)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
          }}
          tabIndex={0}
        >
          <span className="mono uppercase flex-1 truncate text-xs">{value || placeholder}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </div>
        {open && (
          <div className="catalogue-scroll absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-foreground bg-popover shadow-md">
            {onClear && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  onClear();
                  setOpen(false);
                }}
                className={`mono w-full px-3 py-2 text-left text-xs uppercase hover:bg-muted ${value === "" ? "bg-muted" : ""}`}
              >
                {placeholder ?? "None"}
              </button>
            )}
            {groups.map((group) => (
              <div key={group.language || "all"}>
                {group.language && (
                  <div className="mono bg-muted/60 px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {group.language}
                  </div>
                )}
                {group.translations
                  .filter((t) => t.code !== exclude)
                  .map((t) => (
                    <button
                      key={t.code}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onPick(t.code);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted ${t.code === value ? "bg-muted" : ""}`}
                    >
                      <span className="mono uppercase text-xs shrink-0">{t.code}</span>
                      <span className="mono uppercase text-[10px] tracking-wider text-muted-foreground truncate text-right">
                        {t.label.replace(/^.+?—\s*/, "")}
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
