import { Check, Plus } from "lucide-react";

/** A circle icon toggle: a + (outline) when off, a check on green when on. */
export function ToggleAddButton({
  on,
  onClick,
  disabled = false,
  addLabel = "Add",
  onLabel = "Added",
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  addLabel?: string;
  onLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={on ? onLabel : addLabel}
      aria-label={on ? onLabel : addLabel}
      className={
        on
          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-green)] text-[var(--brand-white)] transition hover:opacity-90"
          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground text-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-40"
      }
    >
      {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
    </button>
  );
}
