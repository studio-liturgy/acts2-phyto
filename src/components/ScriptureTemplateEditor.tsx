import { useEffect, useState } from "react";
import { useLibrary, useScriptureTemplateDraft } from "@/lib/store";

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Sans", value: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Serif", value: "'Times New Roman', Times, serif" },
  { label: "Mono", value: "'Courier New', Courier, monospace" },
];

export function ScriptureTemplateEditor() {
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const setScriptureTemplate = useLibrary((s) => s.setScriptureTemplate);
  const setPreviewDraft = useScriptureTemplateDraft((s) => s.setDraft);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    fontScale: scriptureTemplate.fontScale ?? 1,
    fontFamily: scriptureTemplate.fontFamily ?? FONT_OPTIONS[0].value,
    bg: (scriptureTemplate.bg ?? "black") as "black" | "white",
    align: (scriptureTemplate.align ?? "left") as "center" | "left",
    referencePosition: (scriptureTemplate.referencePosition ?? "below") as "above" | "below",
  });

  useEffect(() => {
    if (!open) {
      setDraft({
        fontScale: scriptureTemplate.fontScale ?? 1,
        fontFamily: scriptureTemplate.fontFamily ?? FONT_OPTIONS[0].value,
        bg: (scriptureTemplate.bg ?? "black") as "black" | "white",
        align: (scriptureTemplate.align ?? "left") as "center" | "left",
        referencePosition: (scriptureTemplate.referencePosition ?? "below") as "above" | "below",
      });
    }
  }, [scriptureTemplate, open]);

  useEffect(() => {
    if (open) setPreviewDraft(draft);
    else setPreviewDraft(null);
  }, [open, draft, setPreviewDraft]);

  useEffect(() => () => setPreviewDraft(null), [setPreviewDraft]);

  const label = "Edit Scripture Template";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mono pill flex w-full items-center justify-center border border-foreground px-4 py-2 text-sm transition hover:bg-foreground hover:text-background"
      >
        {label}
      </button>
    );
  }

  const apply = () => {
    setScriptureTemplate({ ...draft });
    setPreviewDraft(null);
    setOpen(false);
  };

  const cancel = () => {
    setPreviewDraft(null);
    setOpen(false);
  };

  return (
    <div className="rounded-2xl border border-foreground p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="mono text-[10px] uppercase tracking-wider">{label}</div>
        <button
          onClick={cancel}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-4 text-sm">
        {/* Font size */}
        <div>
          <div className="mono mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider">
            <span>Font size</span>
            <span className="text-muted-foreground">{draft.fontScale.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={2}
            step={0.05}
            value={draft.fontScale}
            onChange={(e) =>
              setDraft((d) => ({ ...d, fontScale: Number(e.target.value) }))
            }
            className="w-full"
          />
        </div>

        {/* Font type */}
        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider">Font type</div>
          <div className="grid grid-cols-1 gap-1">
            {FONT_OPTIONS.map((f) => {
              const active = draft.fontFamily === f.value;
              return (
                <button
                  key={f.label}
                  onClick={() => setDraft((d) => ({ ...d, fontFamily: f.value }))}
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
          <div className="mono mb-2 text-[10px] uppercase tracking-wider">Background</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDraft((d) => ({ ...d, bg: "black" }))}
              className={`rounded-lg border px-3 py-2 text-xs transition ${
                draft.bg === "black"
                  ? "border-foreground bg-black text-white"
                  : "border-foreground/20 bg-black text-white/60 hover:border-foreground"
              }`}
            >
              Black
            </button>
            <button
              onClick={() => setDraft((d) => ({ ...d, bg: "white" }))}
              className={`rounded-lg border px-3 py-2 text-xs transition ${
                draft.bg === "white"
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
          <div className="mono mb-2 text-[10px] uppercase tracking-wider">Alignment</div>
          <div className="grid grid-cols-2 gap-2">
            {(["left", "center"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setDraft((d) => ({ ...d, align: a }))}
                className={`rounded-lg border px-3 py-2 text-xs capitalize transition ${
                  draft.align === a
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
          <div className="mono mb-2 text-[10px] uppercase tracking-wider">Reference</div>
          <div className="grid grid-cols-2 gap-2">
            {(["above", "below"] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => setDraft((d) => ({ ...d, referencePosition: pos }))}
                className={`rounded-lg border px-3 py-2 text-xs capitalize transition ${
                  draft.referencePosition === pos
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 hover:border-foreground"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={apply}
          className="pill flex w-full items-center justify-center border border-foreground bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-90"
        >
          Apply to all scripture
        </button>
      </div>
    </div>
  );
}
