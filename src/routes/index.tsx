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
} from "lucide-react";
import { useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stage — Live presentation" },
      { name: "description", content: "Project lyrics, scripture, and images. Jump between slides live." },
    ],
  }),
  component: Library,
});

// Drag types — used across the page for drag-and-drop between decks and playlists.
const DECK_DRAG_TYPE = "application/x-stage-deck-id";

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

  const [newPlaylistName, setNewPlaylistName] = useState("");

  const newDeck = (kind: "song" | "scripture" | "media") => {
    const id = createDeck({
      name: kind === "song" ? "New Song" : kind === "scripture" ? "New Scripture" : "New Media",
      kind,
      slides: [],
    });
    navigate({ to: "/deck/$deckId", params: { deckId: id } });
  };

  const createNewPlaylist = () => {
    const name = newPlaylistName.trim() || "Sunday service";
    createPlaylist(name);
    setNewPlaylistName("");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            Stage
          </Link>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/output">
                <Monitor className="mr-2 h-4 w-4" /> Open output window
              </Link>
            </Button>
            <Button asChild>
              <Link to="/present">Present</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <section className="mb-8">
          <h1 className="mb-1 text-2xl font-semibold">Library</h1>
          <p className="text-sm text-muted-foreground">
            Build a service from your decks. Drag any deck into a playlist to add it.
          </p>
        </section>

        {/* Playlists — primary surface */}
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              <ListMusic className="h-4 w-4" /> Service playlists
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createNewPlaylist();
              }}
              className="flex gap-2"
            >
              <Input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Sunday morning"
                className="h-8 w-44"
              />
              <Button size="sm" type="submit">
                <Plus className="mr-1 h-3 w-3" /> New playlist
              </Button>
            </form>
          </div>
          {playlistOrder.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No playlists yet. Create one, then drag decks in to build a service.
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {playlistOrder.map((pid) => {
                const p = playlists[pid];
                if (!p) return null;
                return (
                  <PlaylistCard
                    key={pid}
                    playlistId={pid}
                    name={p.name}
                    deckIds={p.deckIds}
                    deckNames={Object.fromEntries(
                      Object.values(decks).map((d) => [d.id, { name: d.name, kind: d.kind }])
                    )}
                    onRename={(name) => renamePlaylist(pid, name)}
                    onDelete={() => {
                      if (confirm(`Delete playlist "${p.name}"?`)) deletePlaylist(pid);
                    }}
                    onAdd={(deckId) => addDeckToPlaylist(pid, deckId)}
                    onRemove={(deckId) => removeDeckFromPlaylist(pid, deckId)}
                    onReorder={(ids) => reorderPlaylistDecks(pid, ids)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Build new content */}
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Build
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => newDeck("song")}
              className="group rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary"
            >
              <Music className="mb-2 h-5 w-5 text-primary" />
              <div className="font-medium">New Song</div>
              <div className="text-xs text-muted-foreground">Search or paste lyrics</div>
            </button>
            <button
              onClick={() => newDeck("scripture")}
              className="group rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary"
            >
              <BookOpen className="mb-2 h-5 w-5 text-primary" />
              <div className="font-medium">New Scripture</div>
              <div className="text-xs text-muted-foreground">NIV, NLT, ESV, NRSV, NASB, NKJV…</div>
            </button>
            <button
              onClick={() => newDeck("media")}
              className="group rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary"
            >
              <ImageIcon className="mb-2 h-5 w-5 text-primary" />
              <div className="font-medium">New Media</div>
              <div className="text-xs text-muted-foreground">Upload your own images</div>
            </button>
          </div>
        </section>

        {/* All decks — list view */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            All decks
          </h2>
          {order.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              <Plus className="mx-auto mb-2 h-6 w-6 opacity-60" />
              No decks yet. Create one above to get started.
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {order.map((id) => {
                const d = decks[id];
                if (!d) return null;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DECK_DRAG_TYPE, id);
                      e.dataTransfer.setData("text/plain", id);
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
                      <Link to="/deck/$deckId" params={{ deckId: id }}>
                        Edit
                      </Link>
                    </Button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${d.name}"?`)) deleteDeck(id);
                      }}
                      className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete deck"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </Card>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: drag a deck up into a playlist to add it.
          </p>
        </section>
      </main>
    </div>
  );
}

function PlaylistCard({
  playlistId,
  name,
  deckIds,
  deckNames,
  onRename,
  onDelete,
  onAdd,
  onRemove,
  onReorder,
}: {
  playlistId: string;
  name: string;
  deckIds: string[];
  deckNames: Record<string, { name: string; kind: string }>;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAdd: (deckId: string) => void;
  onRemove: (deckId: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const dragId = useRef<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const acceptExternalDrop = (e: React.DragEvent) => {
    const incoming = e.dataTransfer.getData(DECK_DRAG_TYPE) || e.dataTransfer.getData("text/plain");
    if (incoming && !deckIds.includes(incoming)) {
      onAdd(incoming);
    }
  };

  return (
    <Card
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DECK_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropActive(true);
        }
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        acceptExternalDrop(e);
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
          aria-label="Delete playlist"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {deckIds.length === 0 ? (
        <p className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          Drag decks here to add them.
        </p>
      ) : (
        <ol className="space-y-1">
          {deckIds.map((id, i) => {
            const d = deckNames[id];
            return (
              <li
                key={id}
                draggable
                onDragStart={() => (dragId.current = id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.stopPropagation();
                  const from = dragId.current;
                  dragId.current = null;
                  if (!from || from === id) return;
                  if (!deckIds.includes(from)) {
                    // external deck — add it
                    if (!deckIds.includes(from)) onAdd(from);
                    return;
                  }
                  const ids = [...deckIds];
                  const fromIdx = ids.indexOf(from);
                  const toIdx = ids.indexOf(id);
                  ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
                  onReorder(ids);
                }}
                className="flex items-center gap-2 rounded border border-border bg-card/60 px-2 py-1.5 text-sm"
              >
                <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground" />
                <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                <span className="flex-1 truncate">{d?.name ?? "(missing)"}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{d?.kind}</span>
                <button
                  onClick={() => onRemove(id)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Remove from playlist"
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
