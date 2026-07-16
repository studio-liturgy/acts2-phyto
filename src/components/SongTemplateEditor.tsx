import { useEffect, useState } from "react";
import { useLibrary, useSongTemplateDraft } from "@/lib/store";

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Sans", value: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Serif", value: "'Times New Roman', Times, serif" },
  { label: "Mono", value: "'Courier New', Courier, monospace" },
];

export function SongTemplateEditor() {
  const songTemplate = useLibrary((s) => s.songTemplate);
  const setSongTemplate = useLibrary((s) => s.setSongTemplate);
  const setPreviewDraft = useSongTemplateDraft((s) => s.setDraft);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    fontScale: songTemplate.fontScale ?? 1,
    fontFamily: songTemplate.fontFamily ?? FONT_OPTIONS[0].value,
    bg: (songTemplate.bg ?? "black") as "black" | "white",
    position: (songTemplate.position ?? "centre") as "top" | "centre",
  });

  useEffect(() => {
    if (!open) {
      setDraft({
        fontScale: songTemplate.fontScale ?? 1,
        fontFamily: songTemplate.fontFamily ?? FONT_OPTIONS[0].value,
        bg: (songTemplate.bg ?? "black") as "black" | "white",
        position: (songTemplate.position ?? "centre") as "top" | "centre",
      });
    }
  }, [songTemplate, open]);

  useEffect(() => {
    if (open) setPreviewDraft(draft);
    else setPreviewDraft(null);
  }, [open, draft, setPreviewDraft]);

  useEffect(() => () => setPreviewDraft(null), [setPreviewDraft]);

  const label = "Edit Song Template";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mono uppercase pill flex w-full items-center justify-center border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
      >
        {label}
      </button>
    );
  }

  const apply = () => {
    setSongTemplate({ ...draft });
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
        <div className="mono text-[10px] uppercase tracking-wider">Song Template</div>
        <button
          onClick={cancel}
          className="mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-4 text-sm">
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
            onChange={(e) => setDraft((d) => ({ ...d, fontScale: Number(e.target.value) }))}
            className="w-full"
          />
        </div>

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

        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider">Background</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDraft((d) => ({ ...d, bg: "black" }))}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                draft.bg === "black"
                  ? "border-foreground bg-black text-white"
                  : "border-foreground/20 bg-black text-white/60 hover:border-foreground"
              }`}
            >
              Black
            </button>
            <button
              onClick={() => setDraft((d) => ({ ...d, bg: "white" }))}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                draft.bg === "white"
                  ? "border-foreground bg-white text-black"
                  : "border-foreground/20 bg-white text-black/60 hover:border-foreground"
              }`}
            >
              White
            </button>
          </div>
        </div>

        <div>
          <div className="mono mb-2 text-[10px] uppercase tracking-wider">Position</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDraft((d) => ({ ...d, position: "top" }))}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                draft.position === "top"
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 hover:border-foreground"
              }`}
            >
              Top
            </button>
            <button
              onClick={() => setDraft((d) => ({ ...d, position: "centre" }))}
              className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${
                draft.position === "centre"
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 hover:border-foreground"
              }`}
            >
              Centre
            </button>
          </div>
        </div>

        <button
          onClick={apply}
          className="pill mono uppercase flex w-full items-center justify-center border border-foreground bg-foreground px-4 py-1.5 text-xs tracking-wider text-background transition hover:opacity-90"
        >
          Apply to all songs
        </button>
      </div>
    </div>
  );
}
