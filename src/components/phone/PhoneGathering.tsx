import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { List, Search, Smartphone, Trash2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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

type Slot = { key: string; id: string };

/**
 * One gathering on the phone (the presenter's address, /present?gathering=),
 * opened straight into editing: rename, reorder, remove, add sets (live or
 * not), delete; and the Phone view. Go live and Share live on the home card.
 */
export function PhoneGathering({
  gatheringId,
  view,
}: {
  gatheringId: string;
  view: "sets" | "phone";
}) {
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
  const arrangementsOn = useLibrary((s) => s.workspaceSettings.arrangements);
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
      .filter((d) => d && d.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [order, sets, query]);

  const here = `/present?gathering=${encodeURIComponent(gatheringId)}${view === "phone" ? "&view=mobile" : ""}`;

  if (!g) {
    return (
      <PhoneScreen tab="gatherings" header={<PhoneBackHeader back="/" title={null} />}>
        <p className="mono px-6 py-16 text-center text-xs uppercase tracking-wider text-muted-foreground">
          Gathering not found.
        </p>
      </PhoneScreen>
    );
  }

  const canDelete = !g.shared;
  const slots: Slot[] = drag?.order ?? g.setIds.map((id, i) => ({ key: `${id}#${i}`, id }));

  // Sets / Phone, the presenter's Slides / Mobile switch: icons either side.
  const setView = (v: "sets" | "phone") =>
    navigate({
      to: "/present",
      search:
        v === "phone" ? { gathering: gatheringId, view: "mobile" } : { gathering: gatheringId },
      replace: true,
    });
  const viewSwitch = (
    <div className="flex items-center gap-2 pl-1">
      <button type="button" onClick={() => setView("sets")} aria-label="Sets" title="Sets">
        <List className={`h-4 w-4 ${view === "sets" ? "" : "text-muted-foreground"}`} />
      </button>
      <Switch
        checked={view === "phone"}
        onCheckedChange={(on) => setView(on ? "phone" : "sets")}
        aria-label="Phone view"
      />
      <button type="button" onClick={() => setView("phone")} aria-label="Phone" title="Phone">
        <Smartphone className={`h-4 w-4 ${view === "phone" ? "" : "text-muted-foreground"}`} />
      </button>
    </div>
  );

  const header = (
    <PhoneBackHeader
      back="/"
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

  if (view === "phone") {
    return (
      <PhoneScreen tab="gatherings" scroll={false} header={header}>
        {phoneSets.length === 0 ? (
          <p className="mono px-6 py-16 text-center text-xs uppercase tracking-wider text-muted-foreground">
            Gathering is empty. Add a set to preview the phone view.
          </p>
        ) : (
          <div className="relative h-full bg-black">
            <PhoneViewer
              sets={phoneSets}
              hiddenBySet={hidden}
              arrangementsBySet={arrangementsOn ? arranged : undefined}
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
    <PhoneScreen tab="gatherings" header={header}>
      <div className="px-5 pb-10">
        {slots.length === 0 ? (
          <p className="mono uppercase rounded-2xl border border-dashed border-muted-foreground p-4 text-center text-xs text-muted-foreground">
            Search below to add a set to this gathering
          </p>
        ) : (
          <ol ref={listRef} className="flex select-none flex-col gap-1">
            {slots.map((slot, i) => {
              const d = sets[slot.id];
              const held = drag?.index === i;
              return (
                <li
                  key={slot.key}
                  className={`pill flex items-center gap-3 text-sm ${phoneKindBg(d?.kind ?? "mixed")} ${
                    held ? "ring-2 ring-foreground" : ""
                  }`}
                >
                  <span
                    className="flex h-10 w-9 shrink-0 touch-none items-center justify-end [-webkit-touch-callout:none]"
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
              placeholder="Search for a set and add more!"
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

        {canDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="mono mt-10 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--brand-red)] py-3 text-xs uppercase tracking-wider text-[var(--brand-red)] active:bg-[var(--brand-red)] active:text-[var(--brand-white)]"
          >
            <Trash2 className="h-4 w-4" /> Delete gathering
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
