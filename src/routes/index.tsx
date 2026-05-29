import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLibrary } from "@/lib/store";
import { signOut } from "@/lib/auth";
import { useIsSignedIn } from "@/lib/authStore";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Music,
  BookOpen,
  Image as ImageIcon,
  X,
  ChevronDown,
  Search,
  ArrowUpRight,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMemo, useRef, useState } from "react";
import type { SetKind } from "@/lib/types";
import { Footer } from "@/components/Footer";
import { DotsGrip, hideDragGhost, setCircleDragGhost } from "@/components/DragBits";

const KIND_COLOR: Record<string, string> = {
  song: "#2E7299",
  scripture: "#538844",
  media: "#E07D31",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home | phyto" },
      { name: "description", content: "Prepare sets, group them into gatherings, and present them live!" },
      { property: "og:title", content: "Home | phyto" },
      { property: "og:description", content: "Prepare sets, group them into gatherings, and present them live!" },
      { property: "og:url", content: "https://phyto.live/" },
    ],
    links: [
      { rel: "canonical", href: "https://phyto.live/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              name: "phyto",
              url: "https://phyto.live/",
              description: "A lightweight, open-source presentation tool for small home worship gatherings.",
            },
            {
              "@type": "SoftwareApplication",
              name: "phyto",
              applicationCategory: "PresentationApplication",
              operatingSystem: "Any",
              description: "Prepare sets of songs, scripture, and media – group them into gatherings – and present them live.",
              url: "https://phyto.live/",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: Library,
});

const SET_DRAG_TYPE = "application/x-stage-set-id";

type SortMode = "az" | "za" | "newest" | "oldest";
type KindFilter = "all" | SetKind;

function kindBg(kind: SetKind | string): string {
  if (kind === "song") return "bg-[var(--brand-blue)] text-[var(--brand-white)]";
  if (kind === "scripture") return "bg-[var(--brand-green)] text-[var(--brand-white)]";
  if (kind === "media") return "bg-[var(--brand-orange)] text-[var(--brand-white)]";
  return "bg-muted text-foreground";
}

/** Filter chip: filled when active or hovered, outline when idle. */
function kindChip(kind: KindFilter, active: boolean): string {
  if (kind === "all") {
    return active
      ? "border-foreground bg-foreground text-background"
      : "border-foreground text-foreground hover:bg-foreground hover:text-background";
  }
  if (kind === "song") {
    return active
      ? "border-[var(--brand-blue)] bg-[var(--brand-blue)] text-[var(--brand-white)]"
      : "border-[var(--brand-blue)] text-[var(--brand-blue)] hover:bg-[var(--brand-blue)] hover:text-[var(--brand-white)]";
  }
  if (kind === "scripture") {
    return active
      ? "border-[var(--brand-green)] bg-[var(--brand-green)] text-[var(--brand-white)]"
      : "border-[var(--brand-green)] text-[var(--brand-green)] hover:bg-[var(--brand-green)] hover:text-[var(--brand-white)]";
  }
  if (kind === "media") {
    return active
      ? "border-[var(--brand-orange)] bg-[var(--brand-orange)] text-[var(--brand-white)]"
      : "border-[var(--brand-orange)] text-[var(--brand-orange)] hover:bg-[var(--brand-orange)] hover:text-[var(--brand-white)]";
  }
  return "";
}

function Library() {
  const navigate = useNavigate();
  const {
    sets,
    order,
    createSet,
    deleteSet,
    playlists,
    playlistOrder,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addSetToPlaylist,
    removeSetFromPlaylist,
    reorderPlaylistSets,
  } = useLibrary();

  const isSignedIn = useIsSignedIn();
  const [showGoLivePrompt, setShowGoLivePrompt] = useState(false);

  const [playlistFilter, setPlaylistFilter] = useState("");
  const [showPlaylistSearch, setShowPlaylistSearch] = useState(false);
  const [catalogueFilter, setCatalogueFilter] = useState("");
  const [showCatalogueSearch, setShowCatalogueSearch] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("az");

  const newSet = (kind: SetKind) => {
    const id = createSet({
      name: kind === "song" ? "New Song" : kind === "scripture" ? "New Scripture" : "New Media",
      kind,
      slides: [],
    });
    navigate({ to: "/set/$setId", params: { setId: id } });
  };

  const createNewPlaylist = () => {
    const today = new Date().toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    createPlaylist(today);
  };

  const catalogueRows = useMemo(() => {
    const q = catalogueFilter.trim().toLowerCase();
    let rows = order
      .map((id) => sets[id])
      .filter(Boolean)
      .filter((d) => kindFilter === "all" || d.kind === kindFilter)
      .filter((d) => !q || d.name.toLowerCase().includes(q));
    rows = [...rows].sort((a, b) => {
      switch (sortMode) {
        case "az": return a.name.localeCompare(b.name);
        case "za": return b.name.localeCompare(a.name);
        case "newest": return b.createdAt - a.createdAt;
        case "oldest": return a.createdAt - b.createdAt;
      }
    });
    return rows;
  }, [order, sets, catalogueFilter, sortMode, kindFilter]);

  const filteredPlaylistIds = useMemo(() => {
    const q = playlistFilter.trim().toLowerCase();
    if (!q) return playlistOrder;
    return playlistOrder.filter((pid) => playlists[pid]?.name.toLowerCase().includes(q));
  }, [playlistOrder, playlists, playlistFilter]);

  const sortLabel: Record<SortMode, string> = {
    az: "A → Z",
    za: "Z → A",
    newest: "Newest first",
    oldest: "Oldest first",
  };

  const emptyCategoryLabel: Record<string, string> = {
    all: "Nothing in the catalogue yet. Click New to add your first set.",
    song: "No Songs yet!",
    scripture: "No Scriptures yet!",
    media: "No Media yet!",
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="px-6 pt-6 md:pt-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <a
            href="https://www.instagram.com/p/DY51Nn4yylm/"
            target="_blank"
            rel="noopener noreferrer"
            className="pill flex items-center gap-2 border border-foreground px-5 py-2 text-sm transition hover:bg-foreground hover:text-background"
          >
            Quick Tutorial
          </a>

          <div className="ml-auto flex flex-wrap items-center gap-4">
            {isSignedIn ? (
              <button onClick={() => signOut()}>Sign out</button>
            ) : (
              <Link to="/login">Sign in</Link>
            )}
            <Link
              to="/present"
              className="pill flex items-center gap-3 border border-foreground px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-foreground transition hover:bg-foreground hover:text-background"
            >
              Present <ArrowUpRight className="size-[1em]" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-0">
        {/* Gatherings */}
        <section className="mb-24">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-4xl md:text-5xl">Gatherings</h2>
            <div className="flex items-center gap-2 pl-[80px]">
              {showPlaylistSearch ? (
                <div className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2">
                  <Search className="h-4 w-4" />
                  <input
                    autoFocus
                    value={playlistFilter}
                    onChange={(e) => setPlaylistFilter(e.target.value)}
                    onBlur={() => !playlistFilter && setShowPlaylistSearch(false)}
                    placeholder="Search"
                    className="w-40 bg-transparent text-sm outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowPlaylistSearch(true)}
                  className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2 text-sm transition hover:bg-foreground hover:text-background"
                >
                  <Search className="h-4 w-4" /> Search
                </button>
              )}
              <button
                onClick={createNewPlaylist}
                className="pill flex items-center gap-2 bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New
              </button>
            </div>
          </div>

          {playlistOrder.length === 0 ? (
            <div className="rounded-3xl border border-foreground p-10 text-center text-sm text-muted-foreground">
              No gatherings yet. Click New to plan a gathering.
            </div>
          ) : filteredPlaylistIds.length === 0 ? (
            <div className="rounded-3xl border border-foreground p-10 text-center text-sm text-muted-foreground">
              No gatherings match “{playlistFilter}”.
            </div>
          ) : (
            <div className="grid gap-1.5 lg:grid-cols-2">
              {filteredPlaylistIds.map((pid) => {
                const p = playlists[pid];
                if (!p) return null;
                return (
                  <PlaylistCard
                    key={pid}
                    playlistId={pid}
                    name={p.name}
                    setIds={p.setIds}
                    allSets={Object.values(sets)}
                    onRename={(name) => renamePlaylist(pid, name)}
                    onDelete={() => deletePlaylist(pid)}
                    onAdd={(setId) => addSetToPlaylist(pid, setId)}
                    onRemoveAt={(i) => removeSetFromPlaylist(pid, i)}
                    onReorder={(ids) => reorderPlaylistSets(pid, ids)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Catalogue */}
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-4xl md:text-5xl leading-none">Catalogue</h2>
              <div className="flex items-center gap-2 pl-[80px]">
                {(["all", "song", "scripture", "media"] as KindFilter[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKindFilter(k)}
                    className={`pill mono border-2 px-4 py-1.5 text-xs uppercase tracking-wider transition ${kindChip(k, kindFilter === k)}`}
                  >
                    {k === "all" ? "All" : k === "song" ? "Songs" : k === "scripture" ? "Scriptures" : "Media"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="mono flex items-center gap-1 px-2 py-2 text-sm">
                    {sortLabel[sortMode]} <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(sortLabel) as SortMode[]).map((m) => (
                    <DropdownMenuItem key={m} onClick={() => setSortMode(m)}>
                      {sortLabel[m]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {showCatalogueSearch ? (
                <div className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2">
                  <Search className="h-4 w-4" />
                  <input
                    autoFocus
                    value={catalogueFilter}
                    onChange={(e) => setCatalogueFilter(e.target.value)}
                    onBlur={() => !catalogueFilter && setShowCatalogueSearch(false)}
                    placeholder="Search"
                    className="w-40 bg-transparent text-sm outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowCatalogueSearch(true)}
                  className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2 text-sm transition hover:bg-foreground hover:text-background"
                >
                  <Search className="h-4 w-4" /> Search
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="pill flex items-center gap-2 bg-foreground px-4 py-2 text-sm text-background transition hover:opacity-90">
                    <Plus className="h-4 w-4" /> New
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => newSet("song")}>
                    <Music className="mr-2 h-4 w-4" /> New Song
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => newSet("scripture")}>
                    <BookOpen className="mr-2 h-4 w-4" /> New Scripture
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => newSet("media")}>
                    <ImageIcon className="mr-2 h-4 w-4" /> New Media
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {catalogueRows.length === 0 ? (
            <div className="rounded-3xl border border-foreground p-10 text-center text-sm text-muted-foreground">
              {catalogueFilter.trim()
                ? `Nothing matches “${catalogueFilter}”.`
                : emptyCategoryLabel[kindFilter]}
            </div>
          ) : (
            <div className="rounded-3xl border border-foreground p-4">
              <ul className="space-y-1">
                {catalogueRows.map((d) => (
                  <li
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(SET_DRAG_TYPE, d.id);
                      e.dataTransfer.setData("text/plain", d.id);
                      e.dataTransfer.effectAllowed = "copy";
                      setCircleDragGhost(e, KIND_COLOR[d.kind] ?? "#212121", 56);
                    }}
                    className={`pill group flex items-center gap-4 px-5 py-2 ${kindBg(d.kind)}`}
                  >
                    <DotsGrip className="cursor-grab opacity-80" />
                    <span className="flex-1 truncate text-base">{d.name}</span>
                    <span className="mono hidden text-xs uppercase tracking-wider opacity-90 sm:inline">
                      {d.kind} · {d.slides.length} slide{d.slides.length === 1 ? "" : "s"}
                    </span>
                    <Link
                      to="/set/$setId"
                      params={{ setId: d.id }}
                      className="rounded-full p-1.5 transition hover:bg-white/20"
                      title="Edit set"
                      aria-label="Edit set"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mono mt-10 text-xs italic text-muted-foreground">
            Tip: Drag a set into a gathering.
          </p>
        </section>
      </main>

      <Footer />

      {showGoLivePrompt && (
        <div>
          <p>Go Live requires an account so others can join your gathering from their device.</p>
          <Link to="/login" onClick={() => setShowGoLivePrompt(false)}>Sign in or create an account</Link>
          <button onClick={() => setShowGoLivePrompt(false)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

function PlaylistCard({
  name,
  setIds,
  allSets,
  onRename,
  onDelete,
  onAdd,
  onRemoveAt,
  onReorder,
  playlistId,
}: {
  playlistId: string;
  name: string;
  setIds: string[];
  allSets: { id: string; name: string; kind: SetKind }[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onAdd: (setId: string) => void;
  onRemoveAt: (index: number) => void;
  onReorder: (ids: string[]) => void;
}) {
  const dragIndex = useRef<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [editingName, setEditingName] = useState(false);
  // Edit mode reveals destructive controls + the "search for a set" input.
  const [editMode, setEditMode] = useState(false);

  const nameLookup = useMemo(
    () => Object.fromEntries(allSets.map((d) => [d.id, d])),
    [allSets]
  );

  const matches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    return allSets.filter((d) => !q || d.name.toLowerCase().includes(q)).slice(0, 8);
  }, [allSets, addQuery]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        if (dragIndex.current !== null) {
          dragIndex.current = null;
          return;
        }
        const incoming =
          e.dataTransfer.getData(SET_DRAG_TYPE) || e.dataTransfer.getData("text/plain");
        if (incoming && allSets.some((d) => d.id === incoming)) onAdd(incoming);
      }}
      className={`rounded-3xl border border-foreground bg-background p-5 transition ${
        dropActive ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
      }`}
    >
      <div className="mb-4 flex items-center gap-2">
        {editingName && editMode ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => onRename(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            className="h-9 flex-1 border-foreground text-lg"
          />
        ) : (
          <h3
            className={`flex-1 truncate text-2xl ${editMode ? "cursor-text" : ""}`}
            onClick={() => editMode && setEditingName(true)}
            title={editMode ? "Rename" : undefined}
          >
            {name}
          </h3>
        )}
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`pill flex items-center justify-center border border-foreground transition ${
            editMode ? "bg-foreground text-background px-3 h-10 text-sm" : "h-10 w-10 hover:bg-foreground hover:text-background"
          }`}
          title={editMode ? "Done editing" : "Edit"}
          aria-label={editMode ? "Done editing" : "Edit"}
        >
          {editMode ? "Done" : <Pencil className="h-4 w-4" />}
        </button>
        <Link
          to="/present"
          search={{ playlist: playlistId }}
          className="pill flex h-10 w-10 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
          title="Present"
          aria-label="Present"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
        {editMode && (
          <button
            onClick={onDelete}
            className="pill flex h-10 w-10 items-center justify-center text-muted-foreground transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
            aria-label="Delete gathering"
            title="Delete gathering"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {setIds.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-muted-foreground p-3 text-center text-xs text-muted-foreground">
          Drag a set in to add it to this gathering.
        </p>
      ) : (
        <ol className="space-y-1">
          {setIds.map((id, i) => {
            const d = nameLookup[id];
            return (
              <li
                key={`${id}-${i}`}
                draggable
                onDragStart={(e) => {
                  dragIndex.current = i;
                  e.dataTransfer.effectAllowed = "move";
                  hideDragGhost(e);
                }}
                onDragEnd={() => {
                  dragIndex.current = null;
                }}
                onDragOver={(e) => {
                  if (dragIndex.current !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  const from = dragIndex.current;
                  if (from === null) return;
                  e.stopPropagation();
                  e.preventDefault();
                  dragIndex.current = null;
                  if (from === i) return;
                  const ids = [...setIds];
                  const [moved] = ids.splice(from, 1);
                  ids.splice(i, 0, moved);
                  onReorder(ids);
                }}
                className={`pill flex items-center gap-3 px-4 py-1.5 text-sm ${kindBg(d?.kind ?? "mixed")}`}
              >
                <DotsGrip className="cursor-grab opacity-80" />
                <span className="flex-1 truncate">{d?.name ?? "(missing)"}</span>
                <span className="mono text-[10px] uppercase tracking-wider opacity-90">
                  {d?.kind}
                </span>
                {editMode && (
                  <button
                    onClick={() => onRemoveAt(i)}
                    className="rounded-full p-0.5 transition hover:bg-white/25"
                    aria-label="Remove from gathering"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Search-to-add — only shown in edit mode */}
      {editMode && (
        <div className="relative mt-3">
          <div className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2">
            <Search className="h-4 w-4" />
            <input
              value={addQuery}
              onChange={(e) => {
                setAddQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              placeholder="Search for a set and add more!"
              className="mono w-full bg-transparent text-sm italic outline-none placeholder:text-muted-foreground"
            />
          </div>
          {showResults && matches.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-foreground bg-popover shadow-md">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onAdd(m.id);
                    setAddQuery("");
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
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
      )}
    </div>
  );
}
