import { useState } from "react";
import { Trash2 } from "lucide-react";
import { FoldCard } from "@/components/FoldCard";
import { SLIDE_ASPECTS } from "@/lib/background";
import { prepareImageFile } from "@/lib/image-upload";
import { useLibrary } from "@/lib/store";

const LABEL = "mono mb-2 text-[10px] uppercase tracking-wider text-muted-foreground";

/**
 * The one background behind every slide (songs, scripture, media) and the
 * screen's shape, from watch's Edit Background. Lives in the presenter.
 * Changes apply as they're made: no Apply step.
 */
export function BackgroundEditor({ phone = false }: { phone?: boolean } = {}) {
  return (
    <FoldCard title="Background" ariaLabel="the background">
      <BackgroundControls phone={phone} />
    </FoldCard>
  );
}

/** The Background card's controls, also in the export dialog. They edit the
 *  same setting wherever they're shown. */
export function BackgroundControls({
  phone = false,
}: {
  /** The phone's Settings: the card's title already says Background. */
  phone?: boolean;
} = {}) {
  const background = useLibrary((s) => s.background);
  const setBackground = useLibrary((s) => s.setBackground);
  // With an image behind the slide the solid colour is hidden, so the same
  // Black/White pair sets the text colour instead. The render maps bg "black"
  // to white text and "white" to black text, so the buttons over an image are
  // wired to the colour they produce.
  const hasImage = !!background.bgImage;
  const colourButton = (bg: "black" | "white", label: string, swatch: "black" | "white") => {
    const active = background.bg === bg;
    const base = swatch === "black" ? "bg-black text-white" : "bg-white text-black";
    const idle = swatch === "black" ? "text-white/60" : "text-black/60";
    return (
      <button
        onClick={() => setBackground({ bg })}
        className={`mono rounded-lg border px-3 py-2 text-[10px] uppercase transition ${base} ${
          active ? "border-foreground" : `border-foreground/20 ${idle} hover:border-foreground`
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        {(hasImage || !phone) && (
          <div className={LABEL}>{hasImage ? "Font colour" : "Background"}</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {hasImage ? (
            <>
              {colourButton("white", "Black", "white")}
              {colourButton("black", "White", "black")}
            </>
          ) : (
            <>
              {colourButton("black", "Black", "black")}
              {colourButton("white", "White", "white")}
            </>
          )}
        </div>
        <BackgroundImagePicker
          url={background.bgImage}
          dim={background.bgDim}
          onChange={(patch) => setBackground(patch)}
        />
      </div>

      {/* The projected screen's shape. Every slide, thumbnail, the output
            window and exports follow it. */}
      <div>
        <div className={LABEL}>Aspect ratio</div>
        <div className="grid grid-cols-4 gap-2">
          {SLIDE_ASPECTS.map((a) => {
            const active = (background.aspect ?? "16:9") === a;
            return (
              <button
                key={a}
                onClick={() => setBackground({ aspect: a })}
                className={`mono rounded-lg border px-2 py-2 text-[10px] tabular-nums transition ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 hover:border-foreground"
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BackgroundImagePicker({
  url,
  dim,
  onChange,
}: {
  url?: string;
  dim: number;
  onChange: (patch: { bgImage?: string; bgDim?: number }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    let full = false;
    try {
      const prepared = await prepareImageFile(file, () => {
        full = true;
        setErr("Out of storage. Remove a background or some media first.");
      });
      if (prepared) onChange({ bgImage: prepared.url });
      else if (!full) setErr("That image could not be read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        {url && (
          <img src={url} alt="" className="h-10 w-[70px] shrink-0 rounded border object-cover" />
        )}
        <label className="mono flex-1 cursor-pointer rounded-lg border border-foreground/20 px-3 py-2 text-center text-[10px] uppercase transition hover:border-foreground">
          {busy ? "Uploading…" : url ? "Replace image" : "Add image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <button
            type="button"
            aria-label="Remove background image"
            onClick={() => onChange({ bgImage: undefined })}
            className="rounded-lg p-2 text-muted-foreground transition hover:text-[var(--brand-red)]"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {url && (
        <label className="flex items-center gap-2">
          <span className="mono w-16 shrink-0 text-[10px] uppercase tracking-wider">Dim</span>
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={dim}
            onChange={(e) => onChange({ bgDim: Number(e.target.value) })}
            className="w-full"
          />
          <span className="mono w-8 text-right text-[10px] tabular-nums">{dim}%</span>
        </label>
      )}
      {err && <p className="text-[10px] text-destructive">{err}</p>}
    </div>
  );
}
