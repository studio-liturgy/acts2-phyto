import type { ReactNode } from "react";
import { useLibrary } from "@/lib/store";
import { FoldCard } from "@/components/FoldCard";

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Sans", value: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Serif", value: "'Times New Roman', Times, serif" },
  { label: "Mono", value: "'Courier New', Courier, monospace" },
];

/** Changes apply as they're made: no Apply step. */
export function SongTemplateEditor({
  open,
  onOpenChange,
  preview,
}: {
  /** The phone's Settings: one card open at a time, a sample slide on top. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preview?: ReactNode;
} = {}) {
  const songTemplate = useLibrary((s) => s.songTemplate);
  const setSongTemplate = useLibrary((s) => s.setSongTemplate);
  const t = {
    fontScale: songTemplate.fontScale ?? 1,
    fontFamily: songTemplate.fontFamily ?? FONT_OPTIONS[0].value,
    position: (songTemplate.position ?? "centre") as "top" | "centre",
    textCase: (songTemplate.textCase ?? "mixed") as "upper" | "mixed",
  };
  const update = (patch: Partial<typeof t>) => setSongTemplate(patch);

  return (
    <FoldCard
      title="Song Template"
      ariaLabel="the song template"
      open={open}
      onOpenChange={onOpenChange}
    >
      {preview}
      <div className="space-y-4 text-sm">
        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Font size</span>
            <span className="text-muted-foreground">{t.fontScale.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={2}
            step={0.05}
            value={t.fontScale}
            onChange={(e) => update({ fontScale: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Font type
          </div>
          <div className="grid grid-cols-1 gap-1">
            {FONT_OPTIONS.map((f) => {
              const active = t.fontFamily === f.value;
              return (
                <button
                  key={f.label}
                  onClick={() => update({ fontFamily: f.value })}
                  style={{ fontFamily: f.value }}
                  className={`rounded-lg border px-3 py-1.5 text-left text-sm transition ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 hover:border-foreground"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => update({ textCase: "upper" })}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                t.textCase === "upper"
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 hover:border-foreground"
              }`}
            >
              All Caps
            </button>
            <button
              onClick={() => update({ textCase: "mixed" })}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                t.textCase === "mixed"
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 hover:border-foreground"
              }`}
            >
              Mixed Case
            </button>
          </div>
        </div>

        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Position
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => update({ position: "top" })}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                t.position === "top"
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 hover:border-foreground"
              }`}
            >
              Top
            </button>
            <button
              onClick={() => update({ position: "centre" })}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                t.position === "centre"
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 hover:border-foreground"
              }`}
            >
              Centre
            </button>
          </div>
        </div>
      </div>
    </FoldCard>
  );
}
