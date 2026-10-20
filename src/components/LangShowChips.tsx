import { langColor, langDef, type LangCode } from "@/lib/langs";
import { MAX_SHOWN_LANGS, restackSlides, shownLangs, songLangs } from "@/lib/multiling";
import { useLibrary } from "@/lib/store";
import type { Set as PhytoSet } from "@/lib/types";

/**
 * The presenter's language chips for a Multilanguage song: one per column,
 * filled when it shows on the slides. Click to show or hide a language live.
 * At most four show at once and at least one always does. The choice is the
 * song's, so the output window and phones follow it.
 */
export function LangShowChips({ set }: { set: PhytoSet }) {
  const updateSet = useLibrary((s) => s.updateSet);
  const langs = songLangs(set);
  if (langs.length === 0) return null;
  const shown = shownLangs(langs, set.langsShown);
  const toggle = (code: LangCode) => {
    const on = shown.includes(code);
    if (on && shown.length === 1) return;
    if (!on && shown.length >= MAX_SHOWN_LANGS) return;
    const next = langs.filter((l) => (l === code ? !on : shown.includes(l)));
    updateSet(set.id, { langsShown: next, slides: restackSlides(set.slides, next) });
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {langs.map((code) => {
        const on = shown.includes(code);
        const full = !on && shown.length >= MAX_SHOWN_LANGS;
        return (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            disabled={full}
            aria-pressed={on}
            title={
              full
                ? `Up to ${MAX_SHOWN_LANGS} languages show at once`
                : `${on ? "Hide" : "Show"} ${langDef(code).label}`
            }
            className="mono flex h-7 items-center rounded-full border px-2.5 text-[10px] uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              borderColor: langColor(code),
              backgroundColor: on ? langColor(code) : "transparent",
              color: on ? "var(--brand-white)" : undefined,
            }}
          >
            {langDef(code).short}
          </button>
        );
      })}
    </div>
  );
}
