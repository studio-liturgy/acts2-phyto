import { CaseSensitive, CaseUpper, ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useState } from "react";
import { TapRange } from "@/components/TapRange";
import { SLIDE_ASPECTS } from "@/lib/background";
import { prepareImageFile } from "@/lib/image-upload";
import { useLibrary } from "@/lib/store";
import { FONT_OPTIONS } from "@/lib/template-fonts";

// The phone's slide settings, drawn the remote's way: one setting per row,
// font type as three big circles, two-choice settings as split pills. The
// remote's Settings tab and the phone Settings cards both render these, so
// they can't drift apart.

const LABEL = "mono text-[10px] uppercase tracking-wider";
const PILL =
  "mono flex h-7 items-center justify-center rounded-full border px-3 text-[10px] uppercase tracking-wider transition";
const ON = "border-foreground bg-foreground text-background";
const OFF = "border-foreground/40";
// The Background pills: each drawn in the colour it gives.
const SWATCH =
  "mono flex h-[30px] items-center justify-center rounded-full text-[10px] uppercase tracking-wider transition";
const SWATCH_LOOK = { black: "bg-black text-white", white: "bg-white text-black" } as const;
const swatchEdge = (active: boolean) =>
  active ? "border-2 border-foreground" : "border border-foreground/40";

/** A setting with two choices as the two halves of one pill, its label
 *  above (Position, Case, Reference, Alignment), half the row each. */
function SplitSetting({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: [string, ReactNode, string?][];
  value: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className={`${LABEL} mb-2`}>{label}</div>
      <div className="mono flex overflow-hidden rounded-full border border-foreground/40">
        {options.map(([v, content, name], i) => (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            aria-label={name}
            title={name}
            className={`flex h-7 flex-1 items-center justify-center text-[10px] uppercase tracking-wider transition ${
              i > 0 ? "border-l border-foreground/40" : ""
            } ${value === v ? "bg-foreground text-background" : ""}`}
          >
            {content}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Song or Scripture Template: font size, font type, then Position | Case
 *  (song) or Reference | Alignment (scripture and messages). */
export function PhoneTemplateControls({ kind }: { kind: "song" | "scripture" }) {
  const songTemplate = useLibrary((s) => s.songTemplate);
  const setSongTemplate = useLibrary((s) => s.setSongTemplate);
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const setScriptureTemplate = useLibrary((s) => s.setScriptureTemplate);
  const isSong = kind === "song";
  const t = isSong ? songTemplate : scriptureTemplate;
  const setT = isSong ? setSongTemplate : setScriptureTemplate;
  const font = t.fontFamily ?? FONT_OPTIONS[0].value;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className={`${LABEL} shrink-0`}>Font size</span>
        <TapRange
          min={1}
          max={2}
          step={0.05}
          value={t.fontScale ?? 1}
          onValue={(v) => setT({ fontScale: v })}
          className="min-w-0 flex-1"
        />
      </div>

      <div>
        <div className={`${LABEL} mb-2`}>Font type</div>
        {/* Three big circles, together as wide as the space. */}
        <div className="grid grid-cols-3 gap-3">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setT({ fontFamily: f.value })}
              aria-label={f.label}
              title={f.label}
              style={{ fontFamily: f.value }}
              className={`flex aspect-square items-center justify-center rounded-full border text-2xl transition ${
                font === f.value ? ON : OFF
              }`}
            >
              {f.short}
            </button>
          ))}
        </div>
      </div>

      {isSong ? (
        <div className="flex gap-3">
          <SplitSetting
            label="Position"
            options={[
              ["top", <PositionIcon key="t" pos="top" className="h-3.5 w-3.5" />, "Top"],
              ["centre", <PositionIcon key="c" pos="centre" className="h-3.5 w-3.5" />, "Centre"],
            ]}
            value={songTemplate.position ?? "centre"}
            onPick={(v) => setSongTemplate({ position: v as "top" | "centre" })}
          />
          <SplitSetting
            label="Case"
            options={[
              ["upper", <CaseUpper key="u" className="h-4 w-4" />, "All caps"],
              ["mixed", <CaseSensitive key="m" className="h-4 w-4" />, "Mixed case"],
            ]}
            value={songTemplate.textCase ?? "mixed"}
            onPick={(v) => setSongTemplate({ textCase: v as "upper" | "mixed" })}
          />
        </div>
      ) : (
        <div className="flex gap-3">
          <SplitSetting
            label="Reference"
            options={[
              ["above", <ChevronUp key="u" className="h-3.5 w-3.5" />, "Above"],
              ["below", <ChevronDown key="d" className="h-3.5 w-3.5" />, "Below"],
            ]}
            value={scriptureTemplate.referencePosition ?? "below"}
            onPick={(v) => setScriptureTemplate({ referencePosition: v as "above" | "below" })}
          />
          <SplitSetting
            label="Alignment"
            options={[
              ["left", "L", "Left"],
              ["center", "C", "Centre"],
            ]}
            value={scriptureTemplate.align ?? "left"}
            onPick={(v) => setScriptureTemplate({ align: v as "left" | "center" })}
          />
        </div>
      )}
    </div>
  );
}

/** Background: Black, White or an image (then its font colour and Dim),
 *  then the screen's aspect ratio. */
export function PhoneBackgroundControls({
  inCard = false,
}: {
  /** In phone Settings' Background card, whose title already says it. */
  inCard?: boolean;
} = {}) {
  const background = useLibrary((s) => s.background);
  const setBackground = useLibrary((s) => s.setBackground);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageErr, setImageErr] = useState<string | null>(null);
  const hasImage = !!background.bgImage;

  const pickImage = async (file?: File) => {
    if (!file) return;
    setImageBusy(true);
    setImageErr(null);
    let full = false;
    try {
      const prepared = await prepareImageFile(file, () => {
        full = true;
        setImageErr("Out of storage. Remove a background or some media first.");
      });
      if (prepared) setBackground({ bgImage: prepared.url });
      else if (!full) setImageErr("That image could not be read.");
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        {!inCard && <div className={`${LABEL} mb-2`}>Background</div>}
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              ["black", "Black"],
              ["white", "White"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setBackground({ bg: v, bgImage: undefined })}
              className={`${SWATCH} ${SWATCH_LOOK[v]} ${swatchEdge(!hasImage && background.bg === v)}`}
            >
              {label}
            </button>
          ))}
          <label className={`${SWATCH} cursor-pointer ${swatchEdge(hasImage)}`}>
            {imageBusy ? "Uploading" : "Image"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={imageBusy}
              onChange={(e) => {
                void pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {imageErr && <p className="mt-2 text-[10px] text-destructive">{imageErr}</p>}
      </div>

      {hasImage && (
        <>
          {/* Over an image the colour is hidden, so the pair sets the text
              colour. The render gives bg "black" white text and "white"
              black text; each pill shows the text colour it gives. */}
          <div>
            <div className={`${LABEL} mb-2`}>Font colour</div>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  ["white", "Black", "black"],
                  ["black", "White", "white"],
                ] as const
              ).map(([bg, label, look]) => (
                <button
                  key={bg}
                  type="button"
                  onClick={() => setBackground({ bg })}
                  className={`${SWATCH} ${SWATCH_LOOK[look]} ${swatchEdge(background.bg === bg)}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`${LABEL} shrink-0`}>Dim</span>
            <TapRange
              min={0}
              max={90}
              step={5}
              value={background.bgDim}
              onValue={(v) => setBackground({ bgDim: v })}
              className="min-w-0 flex-1"
            />
            <span className="mono w-8 text-right text-[10px] tabular-nums">
              {background.bgDim}%
            </span>
          </div>
        </>
      )}

      {/* Aspect ratio: the screen's shape. */}
      <div>
        <div className={`${LABEL} mb-2`}>Aspect ratio</div>
        <div className="flex flex-wrap gap-2">
          {SLIDE_ASPECTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setBackground({ aspect: a })}
              className={`${PILL} tabular-nums ${(background.aspect ?? "16:9") === a ? ON : OFF}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The song Position icons: chevrons and lines, drawn like the Reference
 *  chevrons beside them. Top: a chevron up under a line. Centre: a chevron
 *  down above a line above a chevron up. */
function PositionIcon({ pos, className }: { pos: "top" | "centre"; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {pos === "top" ? (
        <>
          <path d="M5 6h14" />
          <path d="m6 17 6-6 6 6" />
        </>
      ) : (
        <>
          <path d="m6 3 6 6 6-6" />
          <path d="M5 12h14" />
          <path d="m6 21 6-6 6 6" />
        </>
      )}
    </svg>
  );
}
