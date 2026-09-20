import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WORKSPACE_LANGS,
  type LangCode,
  langColor,
  langDef,
  workspaceLangLabel,
} from "@/lib/langs";
import { cn } from "@/lib/utils";

/**
 * Picks ONE language: a chip in the language's colour (as watch's LanguageBar
 * draws a selected language) that opens the same colour-dotted menu. Used for
 * a workspace's language in Settings and in a group's Manage panel.
 */
export function LanguagePicker({
  value,
  onChange,
  disabled = false,
  className = "",
  exclude = [],
}: {
  value: LangCode;
  onChange: (code: LangCode) => void;
  disabled?: boolean;
  className?: string;
  /** Languages left out of the menu (the ones already taken by a slot). */
  exclude?: LangCode[];
}) {
  const def = langDef(value);
  const options = WORKSPACE_LANGS.filter((l) => !exclude.includes(l.code));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "mono flex h-7 items-center gap-2 rounded-full border px-2.5 text-xs uppercase tracking-wider text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          style={{
            borderColor: langColor(value),
            backgroundColor: `color-mix(in oklab, ${langColor(value)} 14%, transparent)`,
          }}
          title={workspaceLangLabel(value)}
          aria-label={`Language: ${workspaceLangLabel(value)}`}
        >
          <span>{def.short}</span>
          <span className="text-[10px] text-muted-foreground">{workspaceLangLabel(value)}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 min-w-[14rem] overflow-y-auto">
        {options.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => onChange(l.code)}
            className="gap-3 focus:!bg-[var(--lang-tint)] data-[highlighted]:!bg-[var(--lang-tint)]"
            style={
              {
                "--lang-tint": `color-mix(in oklab, ${langColor(l.code)} 22%, transparent)`,
              } as React.CSSProperties
            }
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: langColor(l.code) }}
            />
            <span className="mono shrink-0 uppercase">{l.short}</span>
            <span className="mono ml-auto text-right text-[10px] uppercase tracking-wider text-muted-foreground">
              {workspaceLangLabel(l.code)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
