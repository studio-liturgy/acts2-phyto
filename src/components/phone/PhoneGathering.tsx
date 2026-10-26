import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Search, Share2, Trash2, Wifi, X } from "lucide-react";
import {
  gatheringSectionsReady,
  loadGatheringSections,
  useGatheringSections,
  useLibrary,
} from "@/lib/store";
import { useIsSignedIn } from "@/lib/authStore";
import { isLiveNow } from "@/lib/live-session";
import { useGatheringPhoneSets } from "@/lib/gathering-phone-sets";
import { chordChangePatch } from "@/lib/chord-change";
import { moveItem, NO_IDS, NO_SETS, phoneKindBg, reorderTarget } from "@/lib/phone-layout";
import { loadPrefs, type ViewerPrefs } from "@/lib/phone-viewer";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DotsGrip } from "@/components/DragBits";
import { PhoneViewer } from "@/components/PhoneViewer";
import { PhoneBackHeader, PhoneScreen } from "@/components/phone/PhoneChrome";
import { PhoneShareSheet } from "@/components/phone/PhoneShareSheet";

const NONE: Record<string, string[]> = {};

type Slot = { key: string; id: string };

/**
 * One gathering on the phone (the presenter's address, /present?gathering=):
 * its sets, with Edit for rename / reorder / remove / delete, a search to add
 * sets at any time (live or not), Go live and Share, and the phone view.
 */
export function PhoneGathering({
  gatheringId,
  view,
}: {
  gatheringId: string;
  view: "sets" | "phone";
}) {
  const navigate = useNavigate();
  const isSignedIn = useIsSignedIn();
  const g = useLibrary((s) => s.gatherings[gatheringId]);
  const sets = useLibrary((s) => s.sets ?? NO_SETS);
  const order = useLibrary((s) => s.order ?? NO_IDS);
  const renameGathering = useLibrary((s) => s.renameGathering);
  const deleteGathering = useLibrary((s) => s.deleteGathering);
  const addSetToGathering = useLibrary((s) => s.addSetToGathering);
  const removeSetFromGathering = useLibrary((s) => s.removeSetFromGathering);
  const reorderGatheringSets = useLibrary((s) => s.reorderGatheringSets);
  const updateSet = useLibrary((s) => s.updateSet);

  const [editMode, setEditMode] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [sheet, setSheet] = useState<"confirm" | "share" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Touch reorder: the order while a row is held, and which row it is.
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ order: Slot[]; index: number } | null>(null);

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

  const live = g.is_live === null ? false : isLiveNow(g);
  const canDelete = !g.shared;
  const slots: Slot[] = drag?.order ?? g.setIds.map((id, i) => ({ key: `${id}#${i}`, id }));

  const moveDrag = (y: number) => {
    if (!drag || !listRef.current) return;
    const rows = Array.from(listRef.current.children) as HTMLElement[];
    const mids = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2;
    });
    const to = reorderTarget(mids, drag.index, y);
    if (to !== drag.index) setDrag({ order: moveItem(drag.order, drag.index, to), index: to });
  };
  const endDrag = () => {
    if (!drag) return;
    const next = drag.order.map((s) => s.id);
    if (next.join("|") !== g.setIds.join("|")) reorderGatheringSets(gatheringId, next);
    setDrag(null);
  };

  const ICON = "pill flex h-10 w-10 items-center justify-center transition active:bg-foreground/15";

  const header = (
    <PhoneBackHeader
      back="/"
      title={
        editingName && editMode ? (
          <Input
            autoFocus
            value={g.name}
            onChange={(e) => renameGathering(gatheringId, e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            className="h-9 border-foreground text-[16px] shadow-none focus-visible:ring-0"
          />
        ) : (
          <h1
            className={`truncate text-xl ${editMode ? "underline decoration-foreground/30 underline-offset-4" : ""}`}
            onClick={() => editMode && setEditingName(true)}
          >
            {g.name}
          </h1>
        )
      }
      actions={
        editMode ? (
          <button
            onClick={() => {
              setEditingName(false);
              setEditMode(false);
            }}
            className="pill mono uppercase bg-foreground px-4 py-1.5 text-xs tracking-wider text-background"
          >
            Done
          </button>
        ) : (
          <>
            <button
              onClick={() => setEditMode(true)}
              className={ICON}
              title="Edit"
              aria-label="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {isSignedIn && (
              <button
                onClick={() => setSheet("share")}
                className={ICON}
                title="Share gathering"
                aria-label="Share gathering"
              >
                <Share2 className="h-4 w-4" />
              </button>
            )}
            {isSignedIn &&
              (live ? (
                <button
                  onClick={() => setSheet("share")}
                  className="pill ml-1 flex h-10 w-10 animate-pulse items-center justify-center bg-[var(--brand-red)] text-[var(--brand-white)]"
                  title="Live"
                  aria-label="Live"
                >
                  <Wifi className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => setSheet("confirm")}
                  className={ICON}
                  title="Go live"
                  aria-label="Go live"
                >
                  <Wifi className="h-4 w-4" />
                </button>
              ))}
          </>
        )
      }
    />
  );

  // Sets / Phone, like the presenter's Slides / Mobile switch.
  const viewSwitch = !editMode && (
    <div className="flex shrink-0 justify-center gap-2 px-5 py-3">
      {(
        [
          ["sets", "Sets"],
          ["phone", "Phone"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          onClick={() =>
            navigate({
              to: "/present",
              search:
                v === "phone"
                  ? { gathering: gatheringId, view: "mobile" }
                  : { gathering: gatheringId },
              replace: true,
            })
          }
          className={`pill mono uppercase px-5 py-1.5 text-xs tracking-wider transition ${
            view === v ? "bg-foreground text-background" : "border border-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (view === "phone" && !editMode) {
    return (
      <PhoneScreen
        tab="gatherings"
        scroll={false}
        header={
          <>
            {header}
            {viewSwitch}
          </>
        }
      >
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
        <PhoneShareSheet gatheringId={gatheringId} step={sheet} onClose={() => setSheet(null)} />
      </PhoneScreen>
    );
  }

  return (
    <PhoneScreen
      tab="gatherings"
      header={
        <>
          {header}
          {viewSwitch}
        </>
      }
    >
      <div className={`px-5 pb-10 ${editMode ? "pt-4" : ""}`}>
        {slots.length === 0 ? (
          <p className="mono uppercase rounded-2xl border border-dashed border-muted-foreground p-4 text-center text-xs text-muted-foreground">
            Search below to add a set to this gathering
          </p>
        ) : (
          <ol ref={listRef} className="flex flex-col gap-1">
            {slots.map((slot, i) => {
              const d = sets[slot.id];
              const held = drag?.index === i;
              return (
                <li
                  key={slot.key}
                  className={`pill flex items-center gap-3 text-sm transition-shadow ${phoneKindBg(d?.kind ?? "mixed")} ${
                    held ? "ring-2 ring-foreground" : ""
                  }`}
                >
                  {editMode && (
                    <span
                      className="flex h-10 w-9 shrink-0 touch-none items-center justify-end"
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setDrag({ order: slots, index: i });
                      }}
                      onPointerMove={(e) => moveDrag(e.clientY)}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      aria-label="Drag to reorder"
                    >
                      <DotsGrip className="opacity-80" />
                    </span>
                  )}
                  {d ? (
                    <Link
                      to="/set/$setId"
                      params={{ setId: slot.id }}
                      search={{ redirectTo: here }}
                      className={`flex min-w-0 flex-1 items-center gap-3 py-2.5 ${editMode ? "" : "pl-4"}`}
                    >
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="mono text-[10px] uppercase tracking-wider opacity-90">
                        {d.kind}
                      </span>
                    </Link>
                  ) : (
                    <span className={`flex-1 truncate py-2.5 ${editMode ? "" : "pl-4"}`}>
                      (missing)
                    </span>
                  )}
                  {editMode ? (
                    <button
                      onClick={() => removeSetFromGathering(gatheringId, i)}
                      className="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-80 active:bg-foreground/15"
                      aria-label="Remove from gathering"
                      title="Remove from gathering"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="w-2" />
                  )}
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
              className="mono uppercase min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-xs placeholder:text-muted-foreground"
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

        {editMode && canDelete && (
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

      <PhoneShareSheet gatheringId={gatheringId} step={sheet} onClose={() => setSheet(null)} />
    </PhoneScreen>
  );
}
