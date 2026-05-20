import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLibrary } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Music,
  BookOpen,
  Image as ImageIcon,
  Trash2,
  Monitor,
  ListMusic,
  X,
  GripVertical,
  ChevronDown,
  Search,
  ArrowUpDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Create — Live presentation" },
      {
        name: "description",
        content: "Project lyrics, scripture, and images. Jump between slides live.",
      },
    ],
  }),
  component: Library,
});

const DECK_DRAG_TYPE = "application/x-stage-deck-id";

type SortMode = "az" | "za" | "newest" | "oldest";

function Library() {
  const navigate = useNavigate();
  const {
    decks,
    order,
    createDeck,
    deleteDeck,
    playlists,
    playlistOrder,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addDeckToPlaylist,
    removeDeckFromPlaylist,
    reorderPlaylistDecks,
  } = useLibrary();

  const [playlistFilter, setPlaylistFilter] = useState("");
  const [catalogueFilter, setCatalogueFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("az");

  const newDeck = (kind: "song" | "scripture" | "media") => {
    const id = createDeck({
      name: kind === "song" ? "New Song" : kind === "scripture" ? "New Scripture" : "New Media",
      kind,
      slides: [],
    });
    navigate({ to: "/deck/$deckId", params: { deckId: id } });
  };

  const createNewPlaylist = () => {
    createPlaylist("New Gathering");
  };

  // ---- Catalogue: filter + sort ------------------------------------------
  const catalogueRows = useMemo(() => {
    const q = catalogueFilter.trim().toLowerCase();
    let rows = order
      .map((id) => decks[id])
      .filter(Boolean)
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.kind.includes(q));
    rows = [...rows].sort((a, b) => {
      switch (sortMode) {
        case "az":
          return a.name.localeCompare(b.name);
        case "za":
          return b.name.localeCompare(a.name);
        case "newest":
          return b.createdAt - a.createdAt;
        case "oldest":
          return a.createdAt - b.createdAt;
      }
    });
    return rows;
  }, [order, decks, catalogueFilter, sortMode]);

  // ---- Playlists: filter -------------------------------------------------
  const filteredPlaylistIds = useMemo(() => {
    const q = playlistFilter.trim().toLowerCase();
    if (!q) return playlistOrder;
    return playlistOrder.filter((pid) => {
      const p = playlists[pid];
      if (!p) return false;
      return p.name.toLowerCase().includes(q);
    });
  }, [playlistOrder, playlists, playlistFilter]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 px-6 py-4">
          <Button asChild variant="outline">
            <a href="/output" target="_blank" rel="noopener noreferrer">
              <Monitor className="mr-2 h-4 w-4" /> Open output window
            </a>
          </Button>

          <Button asChild>
            <Link to="/present">Present</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <section className="mb-8">
          <h1 className="mb-1 text-2xl font-semibold">Create</h1>
          <p className="text-sm text-muted-foreground">
            Build sets, group them into gatherings, and present live.
          </p>
        </section>

        {/* Gatherings (Service Playlists) */}
        <section className="mb-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Gatherings
            </h2>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={playlistFilter}
                  onChange={(e) => setPlaylistFilter(e.target.value)}
                  placeholder="Search gatherings"
                  className="h-8 w-48 pl-7"
                />
              </div>
              <Button size="sm" onClick={createNewPlaylist}>
                <Plus className="mr-1 h-3 w-3" /> New gathering
              </Button>
            </div>
          </div>
          {playlistOrder.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No gatherings yet. Create one to start planning a service.
            </Card>
          ) : filteredPlaylistIds.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No gatherings match "{playlistFilter}".
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredPlaylistIds.map((pid) => {
                const p = playlists[pid];
                if (!p) return null;
                return (
                  <PlaylistCard
                    key={pid}
                    playlistId={pid}
                    name={p.name}
                    deckIds={p.deckIds}
                    allDecks={Object.values(decks)}
                    onRename={(name) => renamePlaylist(pid, name)}
                    onDelete={() => deletePlaylist(pid)}
                    onAdd={(deckId) => addDeckToPlaylist(pid, deckId)}
                    onRemoveAt={(index) => removeDeckFromPlaylist(pid, index)}
                    onReorder={(ids) => reorderPlaylistDecks(pid, ids)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Catalogue */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Catalogue
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={catalogueFilter}
                  onChange={(e) => setCatalogueFilter(e.target.value)}
                  placeholder="Filter sets"
                  className="h-8 w-48 pl-7"
                />
              </div>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Sort"
              >
                <option value="az">A → Z</option>
                <option value="za">Z → A</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-1 h-3 w-3" /> Build
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => newDeck("song")}>
                    <Music className="mr-2 h-4 w-4" /> New Song
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => newDeck("scripture")}>
                    <BookOpen className="mr-2 h-4 w-4" /> New Scripture
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => newDeck("media")}>
                    <ImageIcon className="mr-2 h-4 w-4" /> New Media
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {catalogueRows.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              <ArrowUpDown className="mx-auto mb-2 h-5 w-5 opacity-60" />
              {order.length === 0
                ? "Nothing in the catalogue yet. Click Build to add your first set."
                : `Nothing matches "${catalogueFilter}".`}
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {catalogueRows.map((d) => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DECK_DRAG_TYPE, d.id);
                    e.dataTransfer.setData("text/plain", d.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="group flex items-center gap-3 px-4 py-3"
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.name}</div>
                    <div className="text-xs capitalize text-muted-foreground">
                      {d.kind} · {d.slides.length} slide{d.slides.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/deck/$deckId" params={{ deckId: d.id }}>
                      Edit
                    </Link>
                  </Button>
                  <button
                    onClick={() => deleteDeck(d.id)}
                    className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100"
                    aria-label="Delete set"
                    title="Delete set"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </Card>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: drag a set up into a gathering, or use its search box to add it.
          </p>
        </section>
      </main>
    </div>
  );
}

function PlaylistCard({
  name,
  deckIds,
  allDecks,
  onRename,
  onDelete,
  onAdd,
  onRemoveAt,
  onReorder,
  playlistId,
}: {
  playlistId: string;
  name: string;
  deckIds: string[];
  allDecks: { id: string; name: string; kind: string }[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onAdd: (deckId: string) => void;
  onRemoveAt: (index: number) => void;
  onReorder: (ids: string[]) => void;
}) {
  // Drag state: either an internal reorder (index) or an external deck (deckId).
  const dragIndex = useRef<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const nameLookup = useMemo(
    () => Object.fromEntries(allDecks.map((d) => [d.id, d])),
    [allDecks]
  );

  const matches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    // Allow re-adding sets that are already in this gathering (duplicates allowed).
    return allDecks
      .filter((d) => !q || d.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allDecks, addQuery]);

  return (
    <Card
      onDragOver={(e) => {
        // Always allow drop on the card so external deck drags land reliably.
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        // Internal reorder drops are handled on the <li>; ignore them here.
        if (dragIndex.current !== null) {
          dragIndex.current = null;
          return;
        }
        const incoming =
          e.dataTransfer.getData(DECK_DRAG_TYPE) || e.dataTransfer.getData("text/plain");
        if (incoming && allDecks.some((d) => d.id === incoming)) onAdd(incoming);
      }}
      className={`p-4 transition ${dropActive ? "ring-2 ring-primary" : ""}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => onRename(e.target.value)}
          className="h-8 flex-1 font-medium"
        />
        <Button asChild size="sm">
          <Link to="/present" search={{ playlist: playlistId }}>
            Present
          </Link>
        </Button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-destructive"
          aria-label="Delete gathering"
          title="Delete gathering"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Search-to-add */}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={addQuery}
          onChange={(e) => {
            setAddQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          placeholder="Add a set — search to find one"
          className="h-8 pl-7"
        />
        {showResults && matches.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
            {matches.map((m) => (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAdd(m.id);
                  setAddQuery("");
                }}
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">{m.name}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{m.kind}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {deckIds.length === 0 ? (
        <p className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          Search above (or drag from the catalogue) to add sets.
        </p>
      ) : (
        <ol className="space-y-1">
          {deckIds.map((id, i) => {
            const d = nameLookup[id];
            return (
              <li
                key={`${id}-${i}`}
                draggable
                onDragStart={(e) => {
                  dragIndex.current = i;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  dragIndex.current = null;
                }}
                onDragOver={(e) => {
                  // Only intercept when this is an internal reorder.
                  if (dragIndex.current !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  const from = dragIndex.current;
                  // External deck drops have no internal index — let them bubble
                  // up to the Card's drop handler so the deck gets added.
                  if (from === null) return;
                  e.stopPropagation();
                  e.preventDefault();
                  dragIndex.current = null;
                  if (from === i) return;
                  const ids = [...deckIds];
                  const [moved] = ids.splice(from, 1);
                  ids.splice(i, 0, moved);
                  onReorder(ids);
                }}

                className="flex items-center gap-2 rounded border border-border bg-card/60 px-2 py-1.5 text-sm"
              >
                <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground" />
                <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                <span className="flex-1 truncate">{d?.name ?? "(missing)"}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{d?.kind}</span>
                <button
                  onClick={() => onRemoveAt(i)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Remove from gathering"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
