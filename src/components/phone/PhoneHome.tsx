import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { useLibrary } from "@/lib/store";
import { signOut } from "@/lib/auth";
import { useAccountSlug } from "@/hooks/use-account-slug";
import { deleteAccount } from "@/lib/account";
import { useIsSignedIn, useUserEmail } from "@/lib/authStore";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { isLiveNow } from "@/lib/live-session";
import { stripChords } from "@/lib/chords";
import { stripInlineFormat } from "@/lib/inline-format";
import { songPatternStyle, songPatterns } from "@/lib/song-layout";
import { nextOwnershipFilter, type OwnershipFilter } from "@/lib/group-catalogue";
import {
  KIND_STEP_NAME,
  kindColorOf,
  kindStepColor,
  kindStepPatterns,
  matchesKindStep,
  nextKindFilter,
  type KindStep,
} from "@/lib/kind-filter";
import {
  claimShares,
  fetchInboxShares,
  fetchSharedOutSetIds,
  saveSharedSet,
  removeSharedSet,
  fetchGroupInvites,
  createGroup,
  acceptGroupInvite,
  declineGroupInvite,
  type InboxShare,
  type GroupInvite,
} from "@/lib/sync";
import { NO_GATHERINGS, NO_IDS, NO_SETS, phoneKindBg, type PhoneTab } from "@/lib/phone-layout";
import type { Set as PhytoSet, SetKind, Slide } from "@/lib/types";
import { SlideView } from "@/components/SlideView";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ShareSetDialog } from "@/components/ShareSetDialog";
import { SharedInboxList } from "@/components/SharedInboxList";
import { GroupPanelDialog } from "@/components/GroupPanelDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SongTemplateEditor } from "@/components/SongTemplateEditor";
import { ScriptureTemplateEditor } from "@/components/ScriptureTemplateEditor";
import { BackgroundEditor } from "@/components/BackgroundEditor";
import { clearBackToSettings, markBackToSettings } from "@/hooks/use-back-home";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/workspace-settings";
import { VersionWarning } from "@/components/VersionWarning";
import { PhoneScreen, PhoneTitleHeader } from "@/components/phone/PhoneChrome";
import { PhoneShareSheet } from "@/components/phone/PhoneShareSheet";

const MAX_GROUPS = 3;

type SortMode = "az" | "newest";
type KindFilter = "all" | "shared" | OwnershipFilter | KindStep;

/** A catalogue filter's name, shown right of the dots. */
function filterName(f: KindFilter): string {
  if (f === "all") return "All";
  if (f === "shared") return "Shared";
  if (f === "personal") return "Personal";
  if (f === "others") return "Others";
  return KIND_STEP_NAME[f];
}

const PILL_OUTLINE =
  "pill mono uppercase flex items-center gap-2 border border-foreground px-4 py-1.5 text-xs tracking-wider transition active:bg-foreground active:text-background";
const PILL_FILLED =
  "pill mono uppercase flex items-center gap-2 bg-foreground px-4 py-1.5 text-xs tracking-wider text-background transition active:opacity-80";
const ICON_PLAIN =
  "pill flex h-10 w-10 items-center justify-center transition active:bg-foreground/15";

export function PhoneHome({ tab }: { tab: PhoneTab }) {
  const isSignedIn = useIsSignedIn();
  // Back to Settings only holds for a page opened from Settings.
  useEffect(() => {
    if (tab !== "settings") clearBackToSettings();
  }, [tab]);
  const activeWorkspace = useLibrary((s) => s.activeWorkspace) ?? "personal";
  const groups = useLibrary((s) => s.groups) ?? [];
  const loadGroups = useLibrary((s) => s.loadGroups);
  const setActiveWorkspace = useLibrary((s) => s.setActiveWorkspace);

  // "Shared with you" and group invites, as on the desktop home.
  const [inbox, setInbox] = useState<InboxShare[]>([]);
  const [groupInvites, setGroupInvites] = useState<GroupInvite[]>([]);
  const [sharedOutIds, setSharedOutIds] = useState<Set<string>>(new Set());
  const [inboxOpen, setInboxOpen] = useState(false);
  const [groupLimitMsg, setGroupLimitMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!isSignedIn) {
      setInbox([]);
      setGroupInvites([]);
      setSharedOutIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      await claimShares();
      const [rows, outIds, invites] = await Promise.all([
        fetchInboxShares(),
        fetchSharedOutSetIds(),
        fetchGroupInvites(),
      ]);
      if (!cancelled) {
        setInbox(rows);
        setSharedOutIds(new Set(outIds));
        setGroupInvites(invites);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);
  useEffect(() => {
    if (inbox.length === 0) setInboxOpen(false);
  }, [inbox.length]);

  const acceptInvite = async (invite: GroupInvite) => {
    if (groups.length >= MAX_GROUPS) {
      setGroupLimitMsg(`You can be in at most ${MAX_GROUPS} groups. Leave one to join another.`);
      return;
    }
    if (!(await acceptGroupInvite(invite.inviteId))) return;
    setGroupInvites((prev) => prev.filter((i) => i.inviteId !== invite.inviteId));
    await loadGroups();
    await setActiveWorkspace(invite.groupId);
  };
  const declineInvite = async (invite: GroupInvite) => {
    await declineGroupInvite(invite.inviteId);
    setGroupInvites((prev) => prev.filter((i) => i.inviteId !== invite.inviteId));
  };

  const arrivals =
    inbox.length > 0 ? (
      <div className="space-y-2 px-5 pb-4">
        {inbox.length > 0 && (
          <button
            onClick={() => setInboxOpen(true)}
            className="mono flex w-full items-center rounded-3xl border border-foreground px-4 py-3 text-left text-xs uppercase tracking-wider"
          >
            <span className="flex-1">
              {inbox.length} set{inbox.length === 1 ? "" : "s"} shared with you
            </span>
            <ChevronDown className="h-4 w-4 -rotate-90" />
          </button>
        )}
      </div>
    ) : null;

  return (
    <>
      {tab === "gatherings" && <GatheringsTab arrivals={arrivals} />}
      {tab === "catalogue" && <CatalogueTab sharedOutIds={sharedOutIds} />}
      {tab === "settings" && (
        <SettingsTab
          groupInvites={groupInvites}
          onAcceptInvite={acceptInvite}
          onDeclineInvite={declineInvite}
        />
      )}

      <Dialog open={inboxOpen} onOpenChange={setInboxOpen}>
        <DialogContent
          className="left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
          aria-describedby={undefined}
        >
          <DialogTitle className="mb-6 pr-10 text-2xl font-normal leading-tight">
            Shared with you
          </DialogTitle>
          <SharedInboxList
            shares={inbox}
            onSave={async (share) => {
              if (await saveSharedSet(share.set.id, share.ownerEmail))
                setInbox((prev) => prev.filter((s) => s.shareId !== share.shareId));
            }}
            onSaveAll={async () => {
              const rows = [...inbox];
              await Promise.all(rows.map((s) => saveSharedSet(s.set.id, s.ownerEmail)));
              setInbox([]);
            }}
            onRemove={async (share) => {
              await removeSharedSet(share.set.id);
              setInbox((prev) => prev.filter((s) => s.shareId !== share.shareId));
            }}
            onRemoveAll={async () => {
              const rows = [...inbox];
              await Promise.all(rows.map((s) => removeSharedSet(s.set.id)));
              setInbox([]);
            }}
            inGroupWorkspace={activeWorkspace !== "personal"}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!groupLimitMsg} onOpenChange={(o) => !o && setGroupLimitMsg(null)}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Group limit reached
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            {groupLimitMsg}
          </AlertDialogDescription>
          <button
            type="button"
            onClick={() => setGroupLimitMsg(null)}
            className="mono uppercase mt-8 w-full rounded-full bg-foreground py-2 text-sm text-background"
          >
            OK
          </button>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Gatherings ─────────────────────────────────────────────────────────── */

function GatheringsTab({ arrivals }: { arrivals: React.ReactNode }) {
  const navigate = useNavigate();
  const isSignedIn = useIsSignedIn();
  const gatherings = useLibrary((s) => s.gatherings ?? NO_GATHERINGS);
  const gatheringOrder = useLibrary((s) => s.gatheringOrder ?? NO_IDS);
  const sets = useLibrary((s) => s.sets ?? NO_SETS);
  const createGathering = useLibrary((s) => s.createGathering);
  // One sheet at a time: which gathering, and whether it opens on Go Live.
  // The id stays after closing so the sheet can play its close animation.
  const [sheet, setSheet] = useState<{ id: string; step: "confirm" | "share" | null } | null>(null);
  // The red live button asks before ending, apart from Share.
  const [ending, setEnding] = useState<string | null>(null);
  const endSession = useLibrary((s) => s.endSession);

  // The live gathering leads, as on desktop.
  const order = useMemo(
    () =>
      [...gatheringOrder].sort(
        (a, b) => Number(isLiveNow(gatherings[b])) - Number(isLiveNow(gatherings[a])),
      ),
    [gatheringOrder, gatherings],
  );
  const primary = order.length ? gatherings[order[0]] : null;
  // Look the share link up now, so the Share sheet opens with it ready
  // instead of fetching on the first tap.
  useAccountSlug({
    scope: { groupId: primary?.group_id ?? null },
    seed: primary?.share_token ?? "",
    enabled: false,
  });

  // Each gathering's card: its name, Edit, Go live (or End Session), sets.
  const renderCard = (id: string, small = false) => {
    const g = gatherings[id];
    if (!g) return null;
    const live = g.is_live === null ? false : isLiveNow(g);
    return (
      // Tight above the title: the row's 40px buttons already pad it.
      <div key={id} className="rounded-3xl border border-foreground px-4 pb-4 pt-2">
        <div className="mb-2 flex items-center gap-0.5">
          <Link
            to="/present"
            search={{ gathering: id }}
            className={`mr-0.5 min-w-0 flex-1 truncate tracking-[-0.045em] ${small ? "text-lg" : "text-2xl"}`}
          >
            {g.name}
          </Link>
          <Link
            to="/present"
            search={{ gathering: id }}
            className={ICON_PLAIN}
            title="Edit"
            aria-label="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          {isSignedIn &&
            (live ? (
              <button
                onClick={() => setEnding(id)}
                className="pill ml-1 flex h-10 w-10 animate-pulse items-center justify-center bg-[var(--brand-red)] text-[var(--brand-white)]"
                title="End session"
                aria-label="End session"
              >
                <Wifi className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => setSheet({ id, step: "confirm" })}
                className={ICON_PLAIN}
                title="Go live"
                aria-label="Go live"
              >
                <Wifi className="h-4 w-4" />
              </button>
            ))}
        </div>
        <Link to="/present" search={{ gathering: id }} className="block">
          {g.setIds.length === 0 ? (
            <p className="mono uppercase rounded-2xl border border-dashed border-muted-foreground p-3 text-center text-xs text-muted-foreground">
              Tap to add sets to this gathering
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {g.setIds.map((sid, i) => {
                const d = sets[sid];
                return (
                  <li
                    key={`${sid}#${i}`}
                    className={`pill flex items-center gap-3 px-4 py-1.5 text-sm ${phoneKindBg(d?.kind ?? "mixed")}`}
                    style={d ? songPatternStyle(songPatterns(d), 9, 0.07) : undefined}
                  >
                    <span className="flex-1 truncate">{d?.name ?? "(missing)"}</span>
                    <span className="mono text-[10px] uppercase tracking-wider opacity-90">
                      {d?.kind}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Link>
      </div>
    );
  };
  const liveIds = order.filter((id) => gatherings[id] && isLiveNow(gatherings[id]));
  const otherIds = liveIds.length ? order.filter((id) => !liveIds.includes(id)) : order;
  const [othersOpen, setOthersOpen] = useState(false);

  // While one is live: scrolling down (a swipe up, or the wheel) splays the
  // other gatherings out; back at the very top, they fold away again.
  const canSplay = liveIds.length > 0 && otherIds.length > 0;
  const listRef = useRef<HTMLDivElement | null>(null);
  const touch = useRef<{ y: number; atTop: boolean } | null>(null);
  const scroller = () => listRef.current?.parentElement ?? null;
  useEffect(() => {
    const el = scroller();
    if (!el || !canSplay || !othersOpen) return;
    let last = el.scrollTop;
    const onScroll = () => {
      // Scrolled back up to the top (from further down): fold them away.
      if (el.scrollTop <= 0 && last > 0) setOthersOpen(false);
      last = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [canSplay, othersOpen]);
  // The space above the live gathering that centres it on the screen,
  // measured once and on resize, never from what opens below it.
  const arrivalsRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const [livePad, setLivePad] = useState(0);
  const hasLive = liveIds.length > 0;
  useLayoutEffect(() => {
    const el = scroller();
    const card = liveRef.current;
    if (!el || !card || !hasLive) return;
    const measure = () => {
      const above = arrivalsRef.current?.offsetHeight ?? 0;
      setLivePad(Math.max(0, Math.round((el.clientHeight - card.offsetHeight) / 2 - above)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(card);
    return () => ro.disconnect();
  }, [hasLive]);

  // Gone live: back to the top, so the live gathering is what's there when
  // the Share screen closes.
  const firstLive = liveIds[0] ?? null;
  const prevLive = useRef(firstLive);
  useEffect(() => {
    if (firstLive && firstLive !== prevLive.current) {
      setOthersOpen(false);
      scroller()?.scrollTo({ top: 0 });
    }
    prevLive.current = firstLive;
  }, [firstLive]);

  const splayGestures = canSplay
    ? {
        onTouchStart: (e: React.TouchEvent) => {
          touch.current = { y: e.touches[0].clientY, atTop: (scroller()?.scrollTop ?? 0) <= 0 };
        },
        onTouchMove: (e: React.TouchEvent) => {
          const t = touch.current;
          if (!t) return;
          const dy = e.touches[0].clientY - t.y;
          if (!othersOpen && dy < -40) {
            setOthersOpen(true);
            touch.current = null;
          } else if (othersOpen && t.atTop && (scroller()?.scrollTop ?? 0) <= 0 && dy > 50) {
            setOthersOpen(false);
            touch.current = null;
          }
        },
        onWheel: (e: React.WheelEvent) => {
          if (!othersOpen && e.deltaY > 20) setOthersOpen(true);
          else if (othersOpen && e.deltaY < -20 && (scroller()?.scrollTop ?? 0) <= 0)
            setOthersOpen(false);
        },
      }
    : {};

  const newGathering = () => {
    const name = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" });
    const id = createGathering(name);
    navigate({ to: "/present", search: { gathering: id } });
  };

  return (
    <PhoneScreen
      tab="gatherings"
      header={
        <PhoneTitleHeader
          title="Gatherings"
          actions={
            <>
              {isSignedIn && primary?.share_token && (
                <button
                  type="button"
                  onClick={() => setSheet({ id: primary.id, step: "share" })}
                  className={ICON_PLAIN}
                  title="Share gathering"
                  aria-label="Share gathering"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              )}
              <button onClick={newGathering} className={PILL_FILLED}>
                <Plus className="h-4 w-4" /> New
              </button>
            </>
          }
        />
      }
    >
      {/* A pixel taller than the screen, so the body always takes the swipe
          (scrolling itself) rather than handing it to the page. */}
      <div ref={listRef} className="flex min-h-[calc(100%+1px)] flex-col" {...splayGestures}>
        <div ref={arrivalsRef}>{arrivals}</div>
        {/* While one is live it sits mid-screen and stays put: Other
            gatherings open below it, extending the page downward. */}
        <div
          className="space-y-2 px-5 pb-8"
          style={liveIds.length > 0 ? { paddingTop: livePad } : undefined}
        >
          {order.length === 0 ? (
            <div className="mono uppercase rounded-3xl border border-foreground p-8 text-center text-xs tracking-wider text-muted-foreground">
              No gatherings yet. Tap New to plan a gathering!
            </div>
          ) : (
            <>
              <div ref={liveRef} className="space-y-2">
                {liveIds.map((id) => renderCard(id))}
              </div>
              {/* While one is live, the rest wait behind one row. */}
              {liveIds.length > 0 && otherIds.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      const opening = !othersOpen;
                      setOthersOpen(opening);
                      // Opening: glide down with the cards as they splay out,
                      // so this row lands at the top with the first one below.
                      if (opening) {
                        const row = e.currentTarget;
                        setTimeout(
                          () => row.scrollIntoView({ behavior: "smooth", block: "start" }),
                          120,
                        );
                      }
                    }}
                    aria-expanded={othersOpen}
                    className="mono flex w-full items-center justify-center gap-2 py-3 text-xs uppercase tracking-wider"
                  >
                    <span>Other gatherings</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-300 ${othersOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {/* Splay: the space opens, and the cards drop in one after another. */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                      othersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="min-h-0 space-y-2 overflow-hidden">
                      {otherIds.map((id, k) => (
                        <div
                          key={id}
                          className="transition-[opacity,transform] duration-300 ease-out"
                          style={{
                            opacity: othersOpen ? 1 : 0,
                            transform: othersOpen ? "none" : `translateY(-${12 + k * 8}px)`,
                            transitionDelay: othersOpen ? `${80 + k * 60}ms` : "0ms",
                          }}
                        >
                          {renderCard(id, true)}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {liveIds.length === 0 && otherIds.map((id) => renderCard(id))}
            </>
          )}
        </div>
      </div>
      {sheet && (
        <PhoneShareSheet
          gatheringId={sheet.id}
          step={sheet.step}
          onClose={() => setSheet({ id: sheet.id, step: null })}
        />
      )}
      {/* End Session confirmation (the red live button), as in the presenter. */}
      <AlertDialog open={ending !== null} onOpenChange={(o) => !o && setEnding(null)}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            End this session?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Ending the session will take this gathering offline. You can go live again at any time.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (ending) void endSession(ending);
                setEnding(null);
              }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background"
            >
              End Session
            </button>
            <button
              type="button"
              onClick={() => setEnding(null)}
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

/* ── Catalogue ──────────────────────────────────────────────────────────── */

const EMPTY_LABEL: Record<string, string> = {
  all: "Nothing in the catalogue yet. Tap New to add your first set",
  song: "No Songs yet!",
  scripture: "No Scriptures yet!",
  media: "No Media yet!",
  "song-chords": "No songs with chords yet!",
  "song-multilang": "No Multi-Language songs yet!",
  "song-response": "No Call and Response songs yet!",
  message: "No Messages yet!",
  shared: "No shared sets yet!",
  personal: "You haven't shared any of your own sets into this group yet",
  others: "No one else has shared sets into this group yet",
};

function CatalogueTab({ sharedOutIds }: { sharedOutIds: Set<string> }) {
  const navigate = useNavigate();
  const isSignedIn = useIsSignedIn();
  const sets = useLibrary((s) => s.sets ?? NO_SETS);
  const order = useLibrary((s) => s.order ?? NO_IDS);
  const createSet = useLibrary((s) => s.createSet);
  const deleteSets = useLibrary((s) => s.deleteSets);
  const unshareSetFromGroup = useLibrary((s) => s.unshareSetFromGroup);
  const activeWorkspace = useLibrary((s) => s.activeWorkspace) ?? "personal";
  const groups = useLibrary((s) => s.groups) ?? [];
  const activeGroup = groups.find((g) => g.id === activeWorkspace);
  const isGroupGuest = !!activeGroup && activeGroup.role !== "admin";

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareSet, setShareSet] = useState<PhytoSet | null>(null);

  useEffect(() => {
    setQuery("");
    setKindFilter("all");
    setEditMode(false);
    setSelected(new Set());
  }, [activeWorkspace]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = order
      .map((id) => sets[id])
      .filter(Boolean)
      .filter((d) =>
        kindFilter === "all"
          ? true
          : kindFilter === "shared"
            ? !!d.shared || sharedOutIds.has(d.id) || (d.groupIds?.length ?? 0) > 0
            : kindFilter === "personal"
              ? !d.shared
              : kindFilter === "others"
                ? !!d.shared
                : matchesKindStep(d, kindFilter),
      )
      .filter(
        (d) =>
          !q ||
          d.name.toLowerCase().includes(q) ||
          d.slides.some((slide) =>
            slide.lines?.some((line) =>
              stripInlineFormat(stripChords(line)).toLowerCase().includes(q),
            ),
          ),
      )
      .filter((d) => !(isGroupGuest && editMode) || !d.shared);
    return [...list].sort((a, b) =>
      sortMode === "az" ? a.name.localeCompare(b.name) : b.createdAt - a.createdAt,
    );
  }, [order, sets, query, kindFilter, sortMode, sharedOutIds, isGroupGuest, editMode]);

  const newSet = (kind: SetKind) => {
    const id = createSet({
      name: kind === "song" ? "New Song" : kind === "scripture" ? "New Scripture" : "New Media",
      kind,
      slides: [],
    });
    navigate({
      to: "/set/$setId",
      params: { setId: id },
      search: { redirectTo: "/?tab=catalogue" },
    });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeSelected = async () => {
    if (activeGroup) {
      await Promise.all([...selected].map((id) => unshareSetFromGroup(id, activeGroup.id)));
    } else {
      await deleteSets([...selected]);
    }
    setConfirmDelete(false);
    setSelected(new Set());
  };

  const chips: KindFilter[] = [
    "song",
    "scripture",
    "media",
    ...(activeWorkspace === "personal"
      ? (["shared"] as const)
      : ([kindFilter === "others" ? "others" : "personal"] as const)),
  ];

  return (
    <PhoneScreen
      tab="catalogue"
      header={
        <>
          <PhoneTitleHeader
            title="Catalogue"
            actions={
              editMode ? (
                <>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    disabled={selected.size === 0}
                    className="pill flex h-10 w-10 items-center justify-center transition active:bg-[var(--brand-red)] active:text-[var(--brand-white)] disabled:opacity-40"
                    title={activeGroup ? "Remove from the group" : "Delete"}
                    aria-label={
                      activeGroup ? "Remove selected sets from the group" : "Delete selected sets"
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setSelected(new Set());
                    }}
                    className={PILL_FILLED}
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditMode(true)}
                    className={ICON_PLAIN}
                    title="Edit catalogue"
                    aria-label="Edit catalogue"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className={PILL_FILLED}>
                        <Plus className="h-4 w-4" /> New
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => newSet("song")}
                        className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-blue)] focus:text-[var(--brand-white)]"
                      >
                        New Song
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => newSet("scripture")}
                        className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-green)] focus:text-[var(--brand-white)]"
                      >
                        New Scripture
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => newSet("media")}
                        className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-orange)] focus:text-[var(--brand-white)]"
                      >
                        New Media
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )
            }
          />
          {/* Search and sort, then the kind filter. */}
          <div className="shrink-0 space-y-3 px-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="pill flex flex-1 items-center gap-2 border border-foreground px-4 py-2">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className="mono uppercase min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="shrink-0 rounded-full p-0.5 text-muted-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setSortMode(sortMode === "az" ? "newest" : "az")}
                className="flex h-10 w-8 items-center justify-center"
                aria-label={sortMode === "az" ? "Sort: A → Z" : "Sort: Newest first"}
                title={sortMode === "az" ? "Sort: A → Z" : "Sort: Newest first"}
              >
                {sortMode === "az" ? (
                  <ArrowDownAZ className="h-4 w-4" />
                ) : (
                  <ArrowDownWideNarrow className="h-4 w-4" />
                )}
              </button>
            </div>
            {/* The presenter's filter dots; the filter's name on the right,
                level with the pills' right edge. */}
            <div className="flex items-center justify-between">
              <span className="-ml-1.5 flex items-center">
                {chips.map((k) => {
                  const color = k === "song" || k === "scripture" || k === "media" ? k : null;
                  const active = color ? kindColorOf(kindFilter) === color : kindFilter === k;
                  const dot = color
                    ? active
                      ? kindStepColor(kindFilter)
                      : kindStepColor(color)
                    : "#6b7280";
                  const next = color
                    ? nextKindFilter(kindFilter, color)
                    : k === "personal" || k === "others"
                      ? nextOwnershipFilter(kindFilter)
                      : kindFilter === k
                        ? "all"
                        : k;
                  return (
                    <button
                      key={k === "others" ? "personal" : k}
                      onClick={() => setKindFilter(next)}
                      aria-pressed={active}
                      aria-label={filterName(next)}
                      className={`flex items-center justify-center rounded-full p-1.5 transition ${
                        kindFilter !== "all" && !active ? "opacity-30" : ""
                      }`}
                    >
                      <span
                        className="h-4 w-4 rounded-full border"
                        style={{
                          backgroundColor: active || kindFilter === "all" ? dot : "transparent",
                          borderColor: dot,
                          ...(color && active
                            ? songPatternStyle(kindStepPatterns(kindFilter), 4, 0.22)
                            : {}),
                        }}
                      />
                    </button>
                  );
                })}
              </span>
              <span className="mono text-[10px] uppercase tracking-wider">
                {filterName(kindFilter)}
              </span>
            </div>
          </div>
        </>
      }
    >
      <div className="px-5 pb-8">
        {rows.length === 0 ? (
          <div className="mono uppercase rounded-3xl border border-foreground p-8 text-center text-xs tracking-wider text-muted-foreground">
            {query.trim() ? `Nothing matches "${query}"` : EMPTY_LABEL[kindFilter]}
          </div>
        ) : (
          <ul className="space-y-1">
            {rows.map((d) => {
              const checked = selected.has(d.id);
              const body = (
                <>
                  {editMode && (
                    <span
                      role="checkbox"
                      aria-checked={checked}
                      className="flex h-4 w-4 shrink-0 items-center justify-center border border-current"
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-base">{d.name}</span>
                  <VersionWarning set={d} />
                  <span className="mono shrink-0 text-[10px] uppercase tracking-wider opacity-90">
                    {d.slides.length} slide{d.slides.length === 1 ? "" : "s"}
                  </span>
                </>
              );
              return (
                <li
                  key={d.id}
                  className={`pill flex items-center gap-2 pr-1.5 ${phoneKindBg(d.kind)}`}
                  style={songPatternStyle(songPatterns(d), 9, 0.07)}
                >
                  {editMode ? (
                    <button
                      onClick={() => toggle(d.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-5 text-left"
                    >
                      {body}
                    </button>
                  ) : (
                    <Link
                      to="/set/$setId"
                      params={{ setId: d.id }}
                      search={{ redirectTo: "/?tab=catalogue" }}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-5"
                    >
                      {body}
                    </Link>
                  )}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {!editMode && !d.shared && isSignedIn && (
                      <button
                        onClick={() => setShareSet(d)}
                        className="flex h-8 w-8 items-center justify-center rounded-full transition active:bg-foreground/15"
                        title="Share set"
                        aria-label="Share set"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            {activeGroup
              ? selected.size === 1
                ? "Remove this set from the group?"
                : `Remove ${selected.size} sets from the group?`
              : `Delete ${selected.size} set${selected.size === 1 ? "" : "s"}?`}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            {activeGroup
              ? "This takes them out of the group and its gatherings. They stay in their owners' personal catalogues."
              : "This will permanently delete the selected sets. This cannot be undone."}
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={removeSelected}
              className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)]"
            >
              {activeGroup ? "Remove" : "Delete"}
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

      {shareSet && (
        <ShareSetDialog
          open={!!shareSet}
          onOpenChange={(o) => !o && setShareSet(null)}
          setId={shareSet.id}
          setName={shareSet.name}
          groups={groups}
        />
      )}
    </PhoneScreen>
  );
}

/* ── Account ────────────────────────────────────────────────────────────── */

function SettingsTab({
  groupInvites,
  onAcceptInvite,
  onDeclineInvite,
}: {
  groupInvites: GroupInvite[];
  onAcceptInvite: (invite: GroupInvite) => void;
  onDeclineInvite: (invite: GroupInvite) => void;
}) {
  const navigate = useNavigate();
  const isSignedIn = useIsSignedIn();
  const userEmail = useUserEmail();
  const syncStatus = useSyncStatus();
  const activeWorkspace = useLibrary((s) => s.activeWorkspace) ?? "personal";
  const groups = useLibrary((s) => s.groups) ?? [];
  const loadGroups = useLibrary((s) => s.loadGroups);
  const setActiveWorkspace = useLibrary((s) => s.setActiveWorkspace);
  const activeGroup = groups.find((g) => g.id === activeWorkspace);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [manage, setManage] = useState(false);

  // New group, as on the desktop home: name it, then invite people.
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const inviteGroup = groups.find((g) => g.id === inviteGroupId);
  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name || creatingGroup || groups.length >= MAX_GROUPS) return;
    setCreatingGroup(true);
    const id = await createGroup(name);
    setCreatingGroup(false);
    setShowNewGroup(false);
    setNewGroupName("");
    if (id) {
      const personal = await fetchWorkspaceSettings({ groupId: null });
      if (personal) await saveWorkspaceSettings({ groupId: id }, personal.settings);
      await loadGroups();
      await setActiveWorkspace(id);
      setInviteGroupId(id);
    }
  };

  const LABEL = "mono text-xs uppercase tracking-wider";
  const SECTION = "py-4";
  // Section titles in the page's small mono, quieter than the controls.
  const HEADING = "mono mb-3 text-[10px] uppercase tracking-wider text-foreground/40";
  // One of Song Template, Scripture Template and Background open at a time.
  const [openCard, setOpenCard] = useState<"song" | "scripture" | "background" | null>(null);
  const cardProps = (card: "song" | "scripture" | "background") => ({
    open: openCard === card,
    onOpenChange: (o: boolean) => setOpenCard(o ? card : null),
  });
  // Settings' pills in the small mono of the Song Template card's title.
  const SMALL = "!py-[7px] !text-[10px] leading-5";
  const S_OUTLINE = `${PILL_OUTLINE} ${SMALL}`;
  const S_FILLED = `${PILL_FILLED} ${SMALL}`;
  const MENU_ITEM = "mono uppercase text-[10px] tracking-wider";
  const TEXT_LINK = "mono text-[10px] uppercase tracking-wider transition active:opacity-50";

  // Delete account, as in the desktop's Account Settings: type the email.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const runDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const err = await deleteAccount(confirmEmail);
    setDeleting(false);
    if (err) {
      setDeleteError(err);
      return;
    }
    setConfirmDelete(false);
    clearBackToSettings();
    navigate({ to: "/", search: {}, replace: true });
  };

  return (
    <PhoneScreen
      tab="settings"
      header={<PhoneTitleHeader title="Settings" actions={<ThemeToggle />} />}
    >
      <div className="px-5 pb-10">
        {/* As on the desktop header: the group switcher (and Manage in a
            group), then the sync dot beside the email. */}
        {isSignedIn ? (
          <div className="space-y-3 py-2">
            {/* One row: email, the sync dot, then the group switcher. */}
            <div className="flex items-center gap-2">
              <span className="mono min-w-0 truncate text-[10px] uppercase tracking-wider text-foreground/60">
                {userEmail}
              </span>
              {syncStatus !== "offline" && (
                <span
                  data-sync={syncStatus}
                  className={`h-3 w-3 shrink-0 rounded-full ${syncStatus === "syncing" ? "bg-[var(--brand-orange)]" : "bg-[var(--brand-green)]"}`}
                  title={syncStatus === "syncing" ? "Syncing…" : "Synced"}
                />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`${S_OUTLINE} ml-auto shrink-0 gap-1.5`} title="Switch group">
                    <span
                      className={`max-w-[9rem] truncate ${activeWorkspace === "personal" ? "" : "normal-case"}`}
                    >
                      {activeGroup?.name ?? "Personal"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                {/* As the group pill's own size: Manage first (in a group),
                    then the other workspaces (not the one you're in), then
                    + New group. */}
                <DropdownMenuContent align="end">
                  {activeGroup && (
                    <>
                      <DropdownMenuItem onClick={() => setManage(true)} className={MENU_ITEM}>
                        Manage
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {activeWorkspace !== "personal" && (
                    <DropdownMenuItem
                      onClick={() => setActiveWorkspace("personal")}
                      className={MENU_ITEM}
                    >
                      Personal
                    </DropdownMenuItem>
                  )}
                  {groups
                    .filter((g) => g.id !== activeWorkspace)
                    .map((g) => (
                      <DropdownMenuItem
                        key={g.id}
                        onClick={() => setActiveWorkspace(g.id)}
                        className={`${MENU_ITEM} normal-case`}
                      >
                        {g.name}
                      </DropdownMenuItem>
                    ))}
                  {groups.length < MAX_GROUPS && (
                    <DropdownMenuItem
                      onClick={() => setShowNewGroup(true)}
                      className={`${MENU_ITEM} text-muted-foreground`}
                    >
                      + New group
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {groupInvites.map((inv) => (
              <div
                key={inv.inviteId}
                className="flex items-center gap-2 rounded-3xl border border-foreground px-4 py-2"
              >
                <span className="mono min-w-0 flex-1 text-[10px] uppercase tracking-wider">
                  Join <span className="normal-case">{inv.groupName}</span>?
                </span>
                <button onClick={() => onAcceptInvite(inv)} className={S_FILLED}>
                  Join
                </button>
                <button
                  onClick={() => onDeclineInvite(inv)}
                  className={ICON_PLAIN}
                  aria-label="Decline"
                  title="Decline"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between py-4">
            <span className={LABEL}>Not signed in</span>
            <Link to="/login" className={S_FILLED}>
              Sign in
            </Link>
          </div>
        )}

        {/* Slide settings: the presenter's Song Template, Scripture Template
            and Background cards, one open at a time, each over a sample slide. */}
        <div className={SECTION}>
          <div className={HEADING}>Slide settings</div>
          <div className="space-y-3">
            <SongTemplateEditor {...cardProps("song")} preview={<SamplePreview kind="song" />} />
            <ScriptureTemplateEditor
              {...cardProps("scripture")}
              preview={<SamplePreview kind="scripture" />}
            />
            <BackgroundEditor
              phone
              {...cardProps("background")}
              preview={<SamplePreview kind="song" />}
            />
          </div>
        </div>

        {/* The footer's links as a quiet two-column list, like the desktop
            footer. Internal pages come Back to Settings. */}
        <div className="grid grid-cols-2 gap-x-6 py-4">
          {(
            [
              [
                { to: "/?intro=true", label: "Intro" },
                { to: "/about", label: "About" },
                { href: "https://www.instagram.com/phyto.live", label: "Instagram" },
                { href: "/donate", label: "Donate" },
              ],
              [
                { to: "/updates", label: "Updates" },
                { href: "https://github.com/studio-liturgy", label: "Source" },
                { to: "/feedback", label: "Feedback" },
                { to: "/terms", label: "Legal" },
              ],
            ] as ({ to: string; label: string } | { href: string; label: string })[][]
          ).map((links, col) => (
            <ul key={col} className="flex flex-col gap-2.5">
              {links.map((l) => (
                <li key={l.label}>
                  {"to" in l ? (
                    <Link
                      to={l.to === "/?intro=true" ? "/" : l.to}
                      search={l.to === "/?intro=true" ? { intro: true } : undefined}
                      onClick={markBackToSettings}
                      className={TEXT_LINK}
                    >
                      {l.label}
                    </Link>
                  ) : (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={TEXT_LINK}
                    >
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ))}
        </div>

        {isSignedIn && (
          <>
            <button
              onClick={() => setConfirmSignOut(true)}
              className={`${S_OUTLINE} mt-6 w-full justify-center`}
            >
              Sign out
            </button>
            <button
              onClick={() => {
                setConfirmEmail("");
                setDeleteError(null);
                setConfirmDelete(true);
              }}
              className={`${S_OUTLINE} mt-2 w-full justify-center !border-[var(--brand-red)] text-[var(--brand-red)] active:bg-[var(--brand-red)] active:text-[var(--brand-white)]`}
            >
              Delete Account
            </button>
          </>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Delete <span className="normal-case">{userEmail}</span>?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            This permanently deletes your sets, gatherings, uploaded media, shares, and any groups
            you own (their members keep their own sets). It cannot be undone. Type your email to
            confirm.
          </AlertDialogDescription>
          <input
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={userEmail ?? "your email"}
            className="mono mt-4 w-full rounded-full border border-foreground bg-background px-4 py-2 text-xs outline-none"
          />
          {deleteError && (
            <p className="mono mt-2 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
              {deleteError}
            </p>
          )}
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              disabled={
                deleting || confirmEmail.trim().toLowerCase() !== (userEmail ?? "").toLowerCase()
              }
              onClick={() => void runDelete()}
              className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] disabled:opacity-40"
            >
              {deleting ? "Deleting" : "Delete forever"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Sign out?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Any live sessions you've started will remain live and accessible to viewers until you
            end them.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setConfirmSignOut(false);
                clearBackToSettings();
                // Out to the intro: nothing to see signed out.
                void signOut().then(() => navigate({ to: "/", search: {}, replace: true }));
              }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setConfirmSignOut(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={showNewGroup}
        onOpenChange={(o) => {
          if (!o) {
            setShowNewGroup(false);
            setNewGroupName("");
          }
        }}
      >
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          <DialogTitle className="text-2xl font-normal leading-tight">New group</DialogTitle>
          <p className="mono mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Invite people into a group and edit together.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateGroup();
              }}
              placeholder="Group name"
              className="mono min-w-0 flex-1 rounded-full border border-foreground bg-background px-4 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void handleCreateGroup()}
              disabled={!newGroupName.trim() || creatingGroup}
              className="mono uppercase rounded-full bg-foreground px-4 py-2 text-xs tracking-wider text-background disabled:opacity-40"
            >
              {creatingGroup ? "Creating…" : "Create"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {inviteGroup && (
        <GroupPanelDialog
          open={inviteGroupId !== null}
          onOpenChange={(o) => !o && setInviteGroupId(null)}
          group={inviteGroup}
          onChanged={loadGroups}
          mode="invite"
        />
      )}
      {activeGroup && (
        <GroupPanelDialog
          open={manage}
          onOpenChange={setManage}
          group={activeGroup}
          onChanged={loadGroups}
        />
      )}
    </PhoneScreen>
  );
}

/* ── Settings' sample slides ───────────────────────────────────────────── */

const SAMPLE_SONG: Slide = {
  id: "sample-song",
  kind: "lyric",
  lines: [
    "How great is our God",
    "Sing with me how great is our God",
    "And all will see how great",
    "How great is our God",
  ],
};
const SAMPLE_SCRIPTURE: Slide = {
  id: "sample-scripture",
  kind: "scripture",
  lines: [
    "\u201cFor God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.\u201d",
  ],
  reference: "John 3:16 NIV",
};

/** A sample slide in the template's current look, above its controls. */
function SamplePreview({ kind }: { kind: "song" | "scripture" }) {
  const songTemplate = useLibrary((s) => s.songTemplate);
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-foreground/20">
      <SlideView
        slide={kind === "song" ? SAMPLE_SONG : SAMPLE_SCRIPTURE}
        template={kind === "song" ? songTemplate : scriptureTemplate}
        variant="thumb"
      />
    </div>
  );
}
