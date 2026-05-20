import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLibrary } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Music, BookOpen, Image as ImageIcon, Trash2, Monitor } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stage — Live presentation" },
      { name: "description", content: "Project lyrics, scripture, and images. Jump between slides live." },
    ],
  }),
  component: Library,
});

function Library() {
  const navigate = useNavigate();
  const { decks, order, createDeck, deleteDeck } = useLibrary();

  const newDeck = (kind: "song" | "scripture" | "media") => {
    const id = createDeck({
      name: kind === "song" ? "New Song" : kind === "scripture" ? "New Scripture" : "New Media",
      kind,
      slides: [],
    });
    navigate({ to: "/deck/$deckId", params: { deckId: id } });
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
            Build decks of slides — songs, scripture passages, and media — then present.
          </p>
        </section>

        <section className="mb-10 grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => newDeck("song")}
            className="group rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary"
          >
            <Music className="mb-2 h-5 w-5 text-primary" />
            <div className="font-medium">New Song</div>
            <div className="text-xs text-muted-foreground">Paste lyrics, auto-split into slides</div>
          </button>
          <button
            onClick={() => newDeck("scripture")}
            className="group rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary"
          >
            <BookOpen className="mb-2 h-5 w-5 text-primary" />
            <div className="font-medium">New Scripture</div>
            <div className="text-xs text-muted-foreground">Import any verse or passage</div>
          </button>
          <button
            onClick={() => newDeck("media")}
            className="group rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary"
          >
            <ImageIcon className="mb-2 h-5 w-5 text-primary" />
            <div className="font-medium">New Media</div>
            <div className="text-xs text-muted-foreground">Upload your own images</div>
          </button>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Decks
          </h2>
          {order.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              <Plus className="mx-auto mb-2 h-6 w-6 opacity-60" />
              No decks yet. Create one above to get started.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {order.map((id) => {
                const d = decks[id];
                if (!d) return null;
                return (
                  <Card key={id} className="group overflow-hidden p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-xs capitalize text-muted-foreground">
                          {d.kind} · {d.slides.length} slide{d.slides.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${d.name}"?`)) deleteDeck(id);
                        }}
                        className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100"
                        aria-label="Delete deck"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to="/deck/$deckId" params={{ deckId: id }}>
                          Edit
                        </Link>
                      </Button>
                      <Button asChild size="sm" className="flex-1">
                        <Link to="/present" search={{ deck: id }}>
                          Present
                        </Link>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
