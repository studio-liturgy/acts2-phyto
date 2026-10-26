import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  acceptGroupInvite,
  declineGroupInvite,
  type InboxShare,
  type GroupInvite,
} from "@/lib/sync";
import { NO_GATHERINGS, NO_IDS, NO_SETS, phoneKindBg, type PhoneTab } from "@/lib/phone-layout";
import type { Set as PhytoSet, SetKind } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { VersionWarning } from "@/components/VersionWarning";
import { PhoneScreen, PhoneTitleHeader } from "@/components/phone/PhoneChrome";
import { PhoneShareSheet } from "@/components/phone/PhoneShareSheet";

const MAX_GROUPS = 3;

type SortMode = "az" | "newest";
type KindFilter = "all" | "shared" | OwnershipFilter | KindStep;

function kindChip(kind: KindFilter, active: boolean): string {
  // Literal classes so Tailwind keeps them (no hover tint on touch).
  if (kind === "song")
    return active
      ? "border-[var(--brand-blue)] bg-[var(--brand-blue)] text-[var(--brand-white)]"
      : "border-[var(--brand-blue)] text-[var(--brand-blue)]";
  if (kind === "scripture")
    return active
      ? "border-[var(--brand-green)] bg-[var(--brand-green)] text-[var(--brand-white)]"
      : "border-[var(--brand-green)] text-[var(--brand-green)]";
  if (kind === "media")
    return active
      ? "border-[var(--brand-orange)] bg-[var(--brand-orange)] text-[var(--brand-white)]"
      : "border-[var(--brand-orange)] text-[var(--brand-orange)]";
  return active
    ? "border-[#6b7280] bg-[#6b7280] text-[var(--brand-white)]"
    : "border-[#6b7280] text-[#6b7280]";
}

const PILL_OUTLINE =
  "pill mono uppercase flex items-center gap-2 border border-foreground px-4 py-1.5 text-xs tracking-wider transition active:bg-foreground active:text-background";
const PILL_FILLED =
  "pill mono uppercase flex items-center gap-2 bg-foreground px-4 py-1.5 text-xs tracking-wider text-background transition active:opacity-80";
const ICON_PLAIN =
  "pill flex h-10 w-10 items-center justify-center transition active:bg-foreground/15";

/** The workspace switcher (Personal and your groups), as on the desktop header. */
function WorkspacePill() {
  const isSignedIn = useIsSignedIn();
  const activeWorkspace = useLibrary((s) => s.activeWorkspace) ?? "personal";
  const activeWorkspaceName = useLibrary((s) => s.activeWorkspaceName) ?? "";
  const groups = useLibrary((s) => s.groups) ?? [];
  const setActiveWorkspace = useLibrary((s) => s.setActiveWorkspace);
  if (!isSignedIn || groups.length === 0) return null;
  const label =
    activeWorkspace === "personal"
      ? "Personal"
      : groups.find((g) => g.id === activeWorkspace)?.name || activeWorkspaceName || "Group";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={PILL_OUTLINE} title="Switch group">
          <span
            className={`max-w-[7rem] truncate ${activeWorkspace === "personal" ? "" : "normal-case"}`}
          >
            {label}
          </span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {activeWorkspace !== "personal" && (
          <DropdownMenuItem
            onClick={() => setActiveWorkspace("personal")}
            className="mono uppercase text-xs tracking-wider"
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
              className="mono text-xs tracking-wider"
            >
              {g.name}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PhoneHome({ tab }: { tab: PhoneTab }) {
  const isSignedIn = useIsSignedIn();
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
    groupInvites.length > 0 || inbox.length > 0 ? (
      <div className="space-y-2 px-5 pb-4">
        {groupInvites.map((inv) => (
          <div
            key={inv.inviteId}
            className="flex items-center gap-2 rounded-3xl border border-foreground px-4 py-3"
          >
            <span className="mono min-w-0 flex-1 text-xs uppercase tracking-wider">
              Join <span className="normal-case">{inv.groupName}</span>?
            </span>
            <button onClick={() => acceptInvite(inv)} className={PILL_FILLED}>
              Join
            </button>
            <button
              onClick={() => declineInvite(inv)}
              className={ICON_PLAIN}
              aria-label="Decline"
              title="Decline"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
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
      {tab === "account" && <AccountTab />}

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

  // The live gathering leads, as on desktop.
  const order = useMemo(
    () =>
      [...gatheringOrder].sort(
        (a, b) => Number(isLiveNow(gatherings[b])) - Number(isLiveNow(gatherings[a])),
      ),
    [gatheringOrder, gatherings],
  );
  const primary = order.length ? gatherings[order[0]] : null;

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
              <WorkspacePill />
              {isSignedIn && primary?.share_token && (
                <button
                  type="button"
                  onClick={() => setSheet({ id: primary.id, step: "share" })}
                  className="pill flex h-9 w-9 items-center justify-center border border-foreground transition active:bg-foreground active:text-background"
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
      {arrivals}
      <div className="space-y-2 px-5 pb-8">
        {order.length === 0 ? (
          <div className="mono uppercase rounded-3xl border border-foreground p-8 text-center text-sm text-muted-foreground">
            No gatherings yet. Tap New to plan a gathering!
          </div>
        ) : (
          order.map((id) => {
            const g = gatherings[id];
            if (!g) return null;
            const live = g.is_live === null ? false : isLiveNow(g);
            return (
              <div key={id} className="rounded-3xl border border-foreground p-4">
                <div className="mb-3 flex items-center gap-0.5">
                  <Link
                    to="/present"
                    search={{ gathering: id }}
                    className="mr-0.5 min-w-0 flex-1 truncate text-2xl"
                  >
                    {g.name}
                  </Link>
                  {isSignedIn &&
                    (live ? (
                      <button
                        onClick={() => setSheet({ id, step: "share" })}
                        className="pill ml-1 flex h-10 w-10 animate-pulse items-center justify-center bg-[var(--brand-red)] text-[var(--brand-white)]"
                        title="Live"
                        aria-label="Live"
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
          })
        )}
      </div>
      {sheet && (
        <PhoneShareSheet
          gatheringId={sheet.id}
          step={sheet.step}
          onClose={() => setSheet({ id: sheet.id, step: null })}
        />
      )}
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
                  <WorkspacePill />
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
          {/* Search and sort, then the kind chips in one scrolling row. */}
          <div className="shrink-0 space-y-3 px-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="pill flex flex-1 items-center gap-2 border border-foreground px-4 py-2">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className="mono uppercase min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
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
            <div className="catalogue-scroll -mx-5 flex gap-2 overflow-x-auto px-5">
              {chips.map((k) => {
                const color = k === "song" || k === "scripture" || k === "media" ? k : null;
                const active = color ? kindColorOf(kindFilter) === color : kindFilter === k;
                const style =
                  color && active
                    ? {
                        backgroundColor: kindStepColor(kindFilter),
                        borderColor: kindStepColor(kindFilter),
                        ...songPatternStyle(kindStepPatterns(kindFilter), 6, 0.14),
                      }
                    : undefined;
                return (
                  <button
                    key={k === "others" ? "personal" : k}
                    onClick={() =>
                      setKindFilter(
                        color
                          ? nextKindFilter(kindFilter, color)
                          : k === "personal" || k === "others"
                            ? nextOwnershipFilter(kindFilter)
                            : kindFilter === k
                              ? "all"
                              : k,
                      )
                    }
                    className={`pill mono shrink-0 border-2 px-4 py-1.5 text-xs uppercase tracking-wider transition ${kindChip(k, active)}`}
                    style={style}
                  >
                    {color && active
                      ? KIND_STEP_NAME[kindFilter as KindStep]
                      : k === "song"
                        ? "Songs"
                        : k === "scripture"
                          ? "Scriptures"
                          : k === "media"
                            ? "Media"
                            : k === "personal"
                              ? "Personal"
                              : k === "others"
                                ? "Others"
                                : "Shared"}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      }
    >
      <div className="px-5 pb-8">
        {rows.length === 0 ? (
          <div className="mono uppercase rounded-3xl border border-foreground p-8 text-center text-sm text-muted-foreground">
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

function AccountTab() {
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

  const ROW = "flex items-center justify-between border-b border-foreground/15 py-4";
  const LABEL = "mono text-xs uppercase tracking-wider";

  return (
    <PhoneScreen tab="account" header={<PhoneTitleHeader title="Account" />}>
      <div className="px-5 pb-10">
        {isSignedIn ? (
          <div className={ROW}>
            <span className="mono min-w-0 truncate text-xs uppercase tracking-wider text-foreground/70">
              {userEmail}
            </span>
            {syncStatus !== "offline" && (
              <span
                data-sync={syncStatus}
                className={`h-4 w-4 shrink-0 rounded-full ${syncStatus === "syncing" ? "bg-[var(--brand-orange)]" : "bg-[var(--brand-green)]"}`}
                title={syncStatus === "syncing" ? "Syncing…" : "Synced"}
              />
            )}
          </div>
        ) : (
          <div className={ROW}>
            <span className={LABEL}>Not signed in</span>
            <Link to="/login" className={PILL_FILLED}>
              Sign in
            </Link>
          </div>
        )}

        {isSignedIn && groups.length > 0 && (
          <div className="border-b border-foreground/15 py-4">
            <div className={`${LABEL} mb-3 text-muted-foreground`}>Workspace</div>
            <div className="flex flex-wrap gap-2">
              {[{ id: "personal", name: "Personal" }, ...groups].map((g) => (
                <button
                  key={g.id}
                  onClick={() => setActiveWorkspace(g.id)}
                  className={`${g.id === activeWorkspace ? PILL_FILLED : PILL_OUTLINE} ${g.id === "personal" ? "" : "normal-case"}`}
                >
                  {g.name}
                </button>
              ))}
            </div>
            {activeGroup && (
              <button onClick={() => setManage(true)} className={`${PILL_OUTLINE} mt-3`}>
                Manage group
              </button>
            )}
          </div>
        )}

        <div className={ROW}>
          <span className={LABEL}>Dark mode</span>
          <ThemeToggle />
        </div>

        <nav className="flex flex-col py-2">
          <Link
            to="/"
            search={{ intro: true }}
            className={`${LABEL} border-b border-foreground/15 py-4`}
          >
            Intro
          </Link>
          {(
            [
              ["/updates", "Updates"],
              ["/feedback", "Feedback"],
              ["/about", "About"],
              ["/privacy", "Privacy"],
              ["/terms", "Terms"],
            ] as const
          ).map(([href, label]) => (
            <Link key={href} to={href} className={`${LABEL} border-b border-foreground/15 py-4`}>
              {label}
            </Link>
          ))}
          <a
            href="/donate"
            target="_blank"
            rel="noopener noreferrer"
            className={`${LABEL} border-b border-foreground/15 py-4`}
          >
            Donate
          </a>
        </nav>

        {isSignedIn && (
          <button
            onClick={() => setConfirmSignOut(true)}
            className={`${PILL_OUTLINE} mt-6 w-full justify-center py-3`}
          >
            Sign out
          </button>
        )}
      </div>

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
                signOut();
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
