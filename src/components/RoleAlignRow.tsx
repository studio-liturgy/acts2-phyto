import { useLibrary } from "@/lib/store";
import { PillSwitch } from "@/components/PillSwitch";

/**
 * A Call and Response song's Role switch and Align picker. Desktop: in the
 * editor's settings row (`contents`, so they sit among its other controls).
 * Phone: its own row at the top of the Phone and Slides tabs, short labels.
 */
export function RoleAlignRow({ setId, phone = false }: { setId: string; phone?: boolean }) {
  const showRoles = useLibrary((s) => !!s.sets[setId]?.showRoles);
  const roleAlign = useLibrary((s) => s.sets[setId]?.roleAlign);
  const updateSet = useLibrary((s) => s.updateSet);
  const roleLabel = phone ? "Role" : "Show role";
  return (
    <span className={phone ? "flex w-full items-center gap-4" : "contents"}>
      <span className="inline-flex shrink-0 items-center gap-2">
        <span className="mono whitespace-nowrap text-[10px] uppercase tracking-wider">
          {roleLabel}
        </span>
        <PillSwitch
          label={roleLabel}
          checked={showRoles}
          onCheckedChange={(on) => updateSet(setId, { showRoles: on || undefined })}
        />
      </span>
      <span className="inline-flex shrink-0 items-center gap-2">
        <span className="mono whitespace-nowrap text-[10px] uppercase tracking-wider">Align</span>
        <div
          className={`pill flex items-center border border-foreground p-0.5 ${phone ? "h-5" : "h-7"}`}
        >
          {(
            [
              ["left", phone ? "L" : "Left"],
              [undefined, phone ? "M" : "Middle"],
              ["split", phone ? "R" : "Right"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => updateSet(setId, { roleAlign: value })}
              aria-pressed={roleAlign === value}
              // flex + leading-none: the letter sits in the middle of the
              // phone's short pill, not on the text's baseline box.
              className={`pill mono flex h-full items-center px-2.5 text-[10px] uppercase leading-none tracking-wider transition ${
                roleAlign === value ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </span>
    </span>
  );
}
