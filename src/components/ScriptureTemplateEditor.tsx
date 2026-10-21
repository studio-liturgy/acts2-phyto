import { useLibrary } from "@/lib/store";
import { FoldCard } from "@/components/FoldCard";

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Sans", value: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Serif", value: "'Times New Roman', Times, serif" },
  { label: "Mono", value: "'Courier New', Courier, monospace" },
];

/** Changes apply as they're made: no Apply step. */
export function ScriptureTemplateEditor() {
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const setScriptureTemplate = useLibrary((s) => s.setScriptureTemplate);
  const t = {
    fontScale: scriptureTemplate.fontScale ?? 1,
    fontFamily: scriptureTemplate.fontFamily ?? FONT_OPTIONS[0].value,
    bg: (scriptureTemplate.bg ?? "black") as "black" | "white",
    align: (scriptureTemplate.align ?? "left") as "center" | "left",
    referencePosition: (scriptureTemplate.referencePosition ?? "below") as "above" | "below",
  };
  const update = (patch: Partial<typeof t>) => setScriptureTemplate(patch);

  return (
    <FoldCard title="Scripture Template" ariaLabel="the scripture template">
      <div className="space-y-4 text-sm">
        {/* Font size */}
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

        {/* Font type */}
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
        </div>

        {/* Background */}
        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Background
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => update({ bg: "black" })}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                t.bg === "black"
                  ? "border-foreground bg-black text-white"
                  : "border-foreground/20 bg-black text-white/60 hover:border-foreground"
              }`}
            >
              Black
            </button>
            <button
              onClick={() => update({ bg: "white" })}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                t.bg === "white"
                  ? "border-foreground bg-white text-black"
                  : "border-foreground/20 bg-white text-black/60 hover:border-foreground"
              }`}
            >
              White
            </button>
          </div>
        </div>

        {/* Alignment */}
        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Alignment
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["left", "center"] as const).map((a) => (
              <button
                key={a}
                onClick={() => update({ align: a })}
                className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                  t.align === a
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 hover:border-foreground"
                }`}
              >
                {a === "center" ? "Centre" : "Left"}
              </button>
            ))}
          </div>
        </div>

        {/* Reference position */}
        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Reference
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["above", "below"] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => update({ referencePosition: pos })}
                className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                  t.referencePosition === pos
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 hover:border-foreground"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      </div>
    </FoldCard>
  );
}
