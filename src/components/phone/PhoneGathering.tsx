import { Link, useNavigate } from "@tanstack/react-router";
import { setMatchesSearch } from "@/lib/set-search";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, List, Monitor, Search, Smartphone, X } from "lucide-react";
import { songPatternStyle, songPatterns } from "@/lib/song-layout";
import { arrangedEntries, effectiveArrangement, sectionOptions } from "@/lib/arrangements";
import { PhoneArrangeButton } from "@/components/phone/PhoneArrangeButton";
import { SlideView } from "@/components/SlideView";
import {
  gatheringSectionsReady,
  loadGatheringSections,
  useGatheringSections,
  useLibrary,
} from "@/lib/store";
import { useGatheringPhoneSets } from "@/lib/gathering-phone-sets";
import { chordChangePatch } from "@/lib/chord-change";
import { moveItem, NO_IDS, NO_SETS, phoneKindBg, reorderTarget } from "@/lib/phone-layout";
import { loadPrefs, type ViewerPrefs } from "@/lib/phone-viewer";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DotsGrip } from "@/components/DragBits";
import { PhoneViewer } from "@/components/PhoneViewer";
import { PhoneBackHeader, PhoneScreen } from "@/components/phone/PhoneChrome";

const NONE: Record<string, string[]> = {};
// "Gathering is empty." in the Phone and Desktop views: one spot, one look.
const EMPTY_NOTE =
  "mono px-6 py-16 text-center text-xs uppercase tracking-wider text-muted-foreground";
const SECTION_TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];

type Slot = { key: string; id: string };

/**
 * One gathering on the phone (the presenter's address, /present?gathering=),
 * opened straight into editing: rename, reorder, remove, add sets (live or
 * not), delete; and the Phone view. Go live and Share live on the home card.
 */
export function PhoneGathering({
  gatheringId,
  view,
  fromLink = false,
}: {
  gatheringId: string;
  view: "sets" | "phone" | "slides";
  /** Opened from the live link's menu: no Back, no Delete, no tab bar, and in
   *  the link's own light or dark. */
  fromLink?: boolean;
}) {
  // From the link: the back arrow returns to it (saved when Edit was tapped).
  const [linkBack, setLinkBack] = useState<string | null>(null);
  useEffect(() => {
    if (!fromLink) return;
    try {
      setLinkBack(sessionStorage.getItem("phyto:link-back"));
    } catch {
      setLinkBack(null);
    }
  }, [fromLink]);
  useEffect(() => {
    if (!fromLink) return;
    const html = document.documentElement;
    const was = html.classList.contains("dark");
    html.classList.toggle("dark", loadPrefs().isDark);
    return () => {
      html.classList.toggle("dark", was);
    };
  }, [fromLink]);
  const navigate = useNavigate();
  const g = useLibrary((s) => s.gatherings[gatheringId]);
  const sets = useLibrary((s) => s.sets ?? NO_SETS);
  const order = useLibrary((s) => s.order ?? NO_IDS);
  const renameGathering = useLibrary((s) => s.renameGathering);
  const deleteGathering = useLibrary((s) => s.deleteGathering);
  const addSetToGathering = useLibrary((s) => s.addSetToGathering);
  const removeSetFromGathering = useLibrary((s) => s.removeSetFromGathering);
  const reorderGatheringSets = useLibrary((s) => s.reorderGatheringSets);
  const updateSet = useLibrary((s) => s.updateSet);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Touch reorder. The held row's order and index live in a ref as well as
  // state: finger moves arrive faster than renders, and each one must start
  // from the last move, not the last render. The listeners sit on the window,
  // not the row: the row moves in the page as it's reordered, and a moved
  // element loses its pointer capture on iPhone, which left the drag stuck.
  const listRef = useRef<HTMLOListElement>(null);
  const dragRef = useRef<{ order: Slot[]; index: number } | null>(null);
  const [drag, setDrag] = useState<{ order: Slot[]; index: number } | null>(null);
  const setIdsRef = useRef<string[]>([]);
  setIdsRef.current = g?.setIds ?? [];

  const startDrag = (slots: Slot[], index: number) => {
    const state = { order: slots, index };
    dragRef.current = state;
    setDrag(state);
    const move = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur || !listRef.current) return;
      e.preventDefault();
      const rows = Array.from(listRef.current.children) as HTMLElement[];
      const mids = rows.map((r) => {
        const b = r.getBoundingClientRect();
        return b.top + b.height / 2;
      });
      const to = reorderTarget(mids, cur.index, e.clientY);
      if (to === cur.index) return;
      const next = { order: moveItem(cur.order, cur.index, to), index: to };
      dragRef.current = next;
      setDrag(next);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!cur) return;
      const ids = cur.order.map((s) => s.id);
      if (ids.join("|") !== setIdsRef.current.join("|")) reorderGatheringSets(gatheringId, ids);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  // Phone view: hidden sections and arrangements as phones get them.
  const phoneSets = useGatheringPhoneSets(gatheringId);
  const hidden = useGatheringSections((s) => s.hidden[gatheringId]) ?? NONE;
  const arranged = useGatheringSections((s) => s.arranged[gatheringId]) ?? NONE;
  // Desktop view: a back-to-top button once it's scrolled down a little.
  const slidesTop = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (view !== "slides") return;
    const scroller = slidesTop.current?.parentElement;
    if (!scroller) return;
    const on = () => setScrolled(scroller.scrollTop > 200);
    on();
    scroller.addEventListener("scroll", on, { passive: true });
    return () => scroller.removeEventListener("scroll", on);
  }, [view, gatheringId]);
  const [prefs, setPrefs] = useState<ViewerPrefs>(() => loadPrefs());
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (!gatheringSectionsReady(useGatheringSections.getState(), gatheringId)) {
      void loadGatheringSections(gatheringId);
    }
  }, [gatheringId]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return order
      .map((id) => sets[id])
      .filter((d) => d && setMatchesSearch(d, q))
      .slice(0, 8);
  }, [order, sets, query]);

  const here = `/present?gathering=${encodeURIComponent(gatheringId)}${view === "phone" ? "&view=mobile" : view === "slides" ? "&view=slides" : ""}${fromLink ? "&link=true" : ""}`;

  if (!g) {
    return (
      <PhoneScreen
        tab={fromLink ? undefined : "gatherings"}
        header={<PhoneBackHeader back="/" title={null} />}
      >
        <p className="mono px-6 py-16 text-center text-xs uppercase tracking-wider text-muted-foreground">
          Gathering not found.
        </p>
      </PhoneScreen>
    );
  }

  const canDelete = !g.shared;
  const slots: Slot[] = drag?.order ?? g.setIds.map((id, i) => ({ key: `${id}#${i}`, id }));

  // List / Phone / Desktop: the set list, the phone view, the slides.
  const setView = (v: "sets" | "phone" | "slides") =>
    navigate({
      to: "/present",
      search: {
        gathering: gatheringId,
        ...(v === "phone"
          ? { view: "mobile" as const }
          : v === "slides"
            ? { view: "slides" as const }
            : {}),
        ...(fromLink ? { link: true } : {}),
      },
      replace: true,
    });
  const viewSwitch = (
    <div className="flex h-8 items-center rounded-full border border-foreground p-0.5">
      {(
        [
          ["sets", "List", List],
          ["phone", "Phone", Smartphone],
          ["slides", "Desktop", Monitor],
        ] as const
      ).map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          aria-label={label}
          aria-pressed={view === v}
          title={label}
          className={`flex h-full w-8 items-center justify-center rounded-full transition ${
            view === v ? "bg-foreground text-background" : "text-muted-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );

  const header = (
    <PhoneBackHeader
      back={fromLink ? linkBack : "/"}
      title={
        // The name is always editable, like a text field that looks like a title.
        <input
          value={g.name}
          onChange={(e) => renameGathering(gatheringId, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Gathering name"
          className="w-full truncate bg-transparent text-xl tracking-[-0.045em] outline-none"
        />
      }
      actions={viewSwitch}
    />
  );

  if (view === "slides") {
    // Desktop: every set's slides as they'll project, in play order (with this
    // gathering's arrangements and hidden sections), each section on its
    // colour with its name, like the presenter's slide grid.
    return (
      <PhoneScreen
        tab={fromLink ? undefined : "gatherings"}
        header={header}
        overlay={
          <button
            type="button"
            onClick={() =>
              slidesTop.current?.parentElement?.scrollTo({ top: 0, behavior: "smooth" })
            }
            className={`pill absolute bottom-4 right-4 z-20 flex h-11 w-11 items-center justify-center border border-foreground bg-background transition-all duration-300 active:opacity-80 ${
              scrolled ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            }`}
            title="Back to top"
            aria-label="Back to top"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        }
      >
        <div
          ref={slidesTop}
          className={`relative space-y-6 ${g.setIds.length === 0 ? "" : "px-5 pb-24 pt-5"}`}
        >
          {/* The same spot and look as the Phone view's empty note. */}
          {g.setIds.length === 0 && (
            <p className={EMPTY_NOTE}>
              Gathering is empty.
              <br />
              Add a set to preview the slides view.
            </p>
          )}
          {g.setIds.map((id, i) => {
            const d = sets[id];
            if (!d) return null;
            const order = arrangedEntries(
              d.slides,
              effectiveArrangement(d.slides, arranged[id], hidden[id]),
            );
            const labels = new Map(sectionOptions(d.slides).map((o) => [o.key, o]));
            const named = order.some(({ group }) => !!group.section);
            return (
              <section key={`${id}#${i}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="mono text-[10px] text-muted-foreground">{i + 1}.</span>
                  <span className="min-w-0 truncate text-base">{d.name}</span>
                </div>
                {d.slides.length === 0 ? (
                  <p className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    No slides
                  </p>
                ) : (
                  <div className="space-y-2">
                    {order.map(({ group, entryKey }) => {
                      const opt = labels.get(group.key);
                      const tint = SECTION_TINTS[(opt?.index ?? 0) % SECTION_TINTS.length];
                      return (
                        <div
                          key={entryKey}
                          className={named ? "space-y-2 rounded-xl p-2" : "space-y-2"}
                          style={
                            named
                              ? { backgroundColor: `color-mix(in oklab, ${tint} 45%, transparent)` }
                              : undefined
                          }
                        >
                          {named && (
                            <p className="mono px-1 text-[10px] uppercase tracking-wider">
                              {opt?.label ?? "Untitled"}
                            </p>
                          )}
                          {group.items.map(({ slide }) => (
                            <div key={slide.id} className="relative overflow-hidden rounded-md">
                              <SlideView slide={slide} versions={d.versions} variant="thumb" />
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </PhoneScreen>
    );
  }

  if (view === "phone") {
    return (
      <PhoneScreen
        tab={fromLink ? undefined : "gatherings"}
        scroll={false}
        header={header}
        overlay={
          <PhoneArrangeButton
            gatheringId={gatheringId}
            set={sets[activeId ?? phoneSets[0]?.id ?? ""]}
          />
        }
      >
        {phoneSets.length === 0 ? (
          <p className={EMPTY_NOTE}>
            Gathering is empty.
            <br />
            Add a set to preview the phone view.
          </p>
        ) : (
          <div className="relative h-full bg-black">
            <PhoneViewer
              sets={phoneSets}
              hiddenBySet={hidden}
              arrangementsBySet={arranged}
              embedded
              showSettings={false}
              prefs={prefs}
              onPrefsChange={setPrefs}
              activeId={activeId}
              onActiveChange={setActiveId}
              onChordChange={(setId, patch) => {
                const d = sets[setId];
                const p = d && chordChangePatch(d, patch);
                if (p) updateSet(setId, p);
              }}
              onEditSet={(id) =>
                navigate({ to: "/set/$setId", params: { setId: id }, search: { redirectTo: here } })
              }
            />
          </div>
        )}
      </PhoneScreen>
    );
  }

  return (
    <PhoneScreen tab={fromLink ? undefined : "gatherings"} header={header}>
      <div className="px-5 pb-10 pt-5">
        {slots.length > 0 && (
          <ol ref={listRef} className="flex select-none flex-col gap-1">
            {slots.map((slot, i) => {
              const d = sets[slot.id];
              const held = drag?.index === i;
              return (
                <li
                  key={slot.key}
                  className={`pill flex items-center gap-2.5 text-sm ${phoneKindBg(d?.kind ?? "mixed")} ${
                    held ? "ring-2 ring-foreground" : ""
                  }`}
                  // The set's mode pattern, as in the catalogue.
                  style={d ? songPatternStyle(songPatterns(d), 9, 0.07) : undefined}
                >
                  {/* The grip lines up with the search bar's magnifier below. */}
                  <span
                    className="flex h-10 shrink-0 touch-none items-center pl-[18px] [-webkit-touch-callout:none]"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      startDrag(slots, i);
                    }}
                    aria-label="Drag to reorder"
                  >
                    <DotsGrip className="opacity-80" />
                  </span>
                  {d ? (
                    <Link
                      to="/set/$setId"
                      params={{ setId: slot.id }}
                      search={{ redirectTo: here }}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5"
                    >
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="mono text-[10px] uppercase tracking-wider opacity-90">
                        {d.kind}
                      </span>
                    </Link>
                  ) : (
                    <span className="flex-1 truncate py-2.5">(missing)</span>
                  )}
                  <button
                    onClick={() => removeSetFromGathering(gatheringId, i)}
                    className="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-80 active:bg-foreground/15"
                    aria-label="Remove from gathering"
                    title="Remove from gathering"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* Search to add: always here, so sets can be added while live. */}
        <div className="mt-4">
          <div className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearching(true)}
              onBlur={() => setTimeout(() => setSearching(false), 150)}
              placeholder="Search for a set to add"
              className="mono uppercase min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuery("")}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {searching && matches.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-2xl border border-foreground">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    addSetToGathering(gatheringId, m.id);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm active:bg-muted"
                >
                  <span className="truncate">{m.name}</span>
                  <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.kind}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {canDelete && !fromLink && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="mono mt-10 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--brand-red)] py-3 text-xs uppercase tracking-wider text-[var(--brand-red)] active:bg-[var(--brand-red)] active:text-[var(--brand-white)]"
          >
            Delete gathering
          </button>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Delete this gathering?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            This will permanently delete this gathering. This cannot be undone.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false);
                deleteGathering(gatheringId);
                navigate({ to: "/" });
              }}
              className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)]"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </PhoneScreen>
  );
}
