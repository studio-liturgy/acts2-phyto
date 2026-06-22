import { Fragment } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { QRCodeCanvas } from "qrcode.react";
import { useLibrary } from "@/lib/store";
import { signOut } from "@/lib/auth";
import { useIsSignedIn } from "@/lib/authStore";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { exportCatalogue, importCatalogue } from "@/lib/catalogue-io";
import { APP_NAME } from "@/lib/appConfig";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Music,
  BookOpen,
  Image as ImageIcon,
  X,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  Search,
  ArrowUpRight,
  Share2,
  Pencil,
  Trash2,
  Upload,
  Download,
  Wifi,
  Copy,
  Check,
  QrCode,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
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
      { title: `Home | ${APP_NAME}` },
      { name: "description", content: "Prepare sets, group them into gatherings, and present them live!" },
      { property: "og:title", content: `Home | ${APP_NAME}` },
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

type SortMode = "az" | "newest";
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
    // Default the array/record fields: during SSR + first client render the
    // zustand store is populated from Dexie in a useEffect, so these selectors
    // can resolve to undefined before loadFromDb runs. Without these defaults,
    // reads like gatheringOrder.length / order.map throw and trip the route's
    // CatchBoundaryImpl on every cold load.
    sets = {},
    order = [],
    createSet,
    deleteSet,
    gatherings = {},
    gatheringOrder = [],
    createGathering,
    renameGathering,
    deleteGathering,
    addSetToGathering,
    removeSetFromGathering,
    reorderGatheringSets,
    goLive,
    endSession,
  } = useLibrary();

  const isSignedIn = useIsSignedIn();
  const syncStatus = useSyncStatus();
  const [showGoLivePrompt, setShowGoLivePrompt] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  // Catalogue import/export
  const importFileRef = useRef<HTMLInputElement>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showExportConfirm, setShowExportConfirm] = useState(false);

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImportFile(file);
    setImportedCount(null);
    setImportError(null);
    e.target.value = '';
  };

  const handleImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImportFile) return;
    try {
      const count = await importCatalogue(pendingImportFile, mode);
      setImportedCount(count);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setPendingImportFile(null);
    }
  };

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

  const createNewGathering = () => {
    const today = new Date().toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    createGathering(today);
  };

  const catalogueRows = useMemo(() => {
    const q = catalogueFilter.trim().toLowerCase();
    let rows = order
      .map((id) => sets[id])
      .filter(Boolean)
      .filter((d) => kindFilter === "all" || d.kind === kindFilter)
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.slides.some((slide) => slide.lines?.some((line) => line.toLowerCase().includes(q))));
    rows = [...rows].sort((a, b) => {
      switch (sortMode) {
        case "az": return a.name.localeCompare(b.name);
        case "newest": return b.createdAt - a.createdAt;
      }
    });
    return rows;
  }, [order, sets, catalogueFilter, sortMode, kindFilter]);

  const sortLabel: Record<SortMode, string> = {
    az: "A → Z",
    newest: "Newest first",
  };

  const emptyCategoryLabel: Record<string, string> = {
    all: "Nothing in the catalogue yet. Click New to add your first set.",
    song: "No Songs yet!",
    scripture: "No Scriptures yet!",
    media: "No Media yet!",
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="pt-6 md:pt-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6">
          <a
            href="https://www.instagram.com/p/DY51Nn4yylm/"
            target="_blank"
            rel="noopener noreferrer"
            className="pill mono uppercase border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
          >
            Quick Tutorial
          </a>
          {!isSignedIn && (
            <Link
              to="/login"
              className="pill mono uppercase border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
            >
              Sign in
            </Link>
          )}
          {isSignedIn && (
            <button
              onClick={() => setShowSignOutDialog(true)}
              className="pill mono uppercase border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
            >
              Sign out
            </button>
          )}
          {isSignedIn && syncStatus !== 'offline' && (
            <span
              data-sync={syncStatus}
              className={`h-4 w-4 rounded-full ${syncStatus === 'syncing' ? 'bg-[var(--brand-orange)]' : 'bg-[var(--brand-green)]'}`}
              style={{ transition: `background-color ${syncStatus === 'syncing' ? '0.5s' : '1.5s'} ease` }}
              title={syncStatus === 'syncing' ? 'Syncing…' : 'Synced'}
            />
          )}

          <div className="ml-auto flex flex-wrap items-center gap-4">
            <Link
              to="/present"
              className="pill flex items-center gap-3 border border-foreground px-[30px] py-[12px] text-5xl tracking-[-0.045em] text-foreground transition hover:bg-foreground hover:text-background"
            >
              Present <ArrowUpRight className="size-[1em]" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {/* Gatherings */}
        <section className="mb-24">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-4xl md:text-5xl">Gatherings</h2>
            <div className="flex items-center gap-2 pl-[80px]">
              <button
                onClick={createNewGathering}
                className="pill mono uppercase flex items-center gap-2 bg-foreground px-4 py-1.5 text-xs tracking-wider text-background transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New
              </button>
            </div>
          </div>

          {gatheringOrder.length === 0 ? (
            <div className="mono uppercase rounded-3xl border border-foreground p-10 text-center text-sm text-muted-foreground">
              No gatherings yet. Click New to plan a gathering!
            </div>
          ) : (
            <div className="grid gap-1.5 lg:grid-cols-2">
              {gatheringOrder.map((pid) => {
                const p = gatherings[pid];
                if (!p) return null;
                return (
                  <GatheringCard
                    key={pid}
                    gatheringId={pid}
                    name={p.name}
                    setIds={p.setIds}
                    isLive={p.is_live}
                    shareToken={p.share_token}
                    allSets={Object.values(sets)}
                    onRename={(name) => renameGathering(pid, name)}
                    onDelete={() => deleteGathering(pid)}
                    onAdd={(setId) => addSetToGathering(pid, setId)}
                    onRemoveAt={(i) => removeSetFromGathering(pid, i)}
                    onReorder={(ids) => reorderGatheringSets(pid, ids)}
                    onGoLive={() => isSignedIn ? goLive(pid) : (setShowGoLivePrompt(true), Promise.resolve())}
                    onEndSession={() => endSession(pid)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Catalogue */}
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            {/* Left: heading + import/export icons */}
            <div className="flex items-center gap-2">
              <h2 className="text-4xl md:text-5xl leading-none">Catalogue</h2>
              <div className="ml-8 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowExportConfirm(true)}
                  className="pill flex h-10 w-10 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                  title="Export"
                  aria-label="Export"
                >
                  <Upload className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  className="pill flex h-10 w-10 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                  title="Import"
                  aria-label="Import"
                >
                  <Download className="h-4 w-4" />
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".phyto"
                  style={{ display: 'none' }}
                  onChange={handleImportFileChange}
                />
              </div>
            </div>
            {/* Right: filter chips + sort + search + new */}
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "song", "scripture", "media"] as KindFilter[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKindFilter(k)}
                  className={`pill mono border-2 px-4 py-1.5 text-xs uppercase tracking-wider transition ${kindChip(k, kindFilter === k)}`}
                >
                  {k === "all" ? "All" : k === "song" ? "Songs" : k === "scripture" ? "Scriptures" : "Media"}
                </button>
              ))}
              <button
                onClick={() => setSortMode(sortMode === "az" ? "newest" : "az")}
                title={`Sort: ${sortLabel[sortMode]}`}
                aria-label={`Sort: ${sortLabel[sortMode]}`}
                className="mono uppercase flex items-center px-2 py-1.5 text-xs tracking-wider"
              >
                {sortMode === "az" ? (
                  <ArrowDownAZ className="h-4 w-4" />
                ) : (
                  <ArrowDownWideNarrow className="h-4 w-4" />
                )}
              </button>
              {showCatalogueSearch ? (
                <div className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2">
                  <Search className="h-4 w-4" />
                  <input
                    autoFocus
                    value={catalogueFilter}
                    onChange={(e) => setCatalogueFilter(e.target.value)}
                    onBlur={() => !catalogueFilter && setShowCatalogueSearch(false)}
                    placeholder="Search"
                    className="mono uppercase w-40 bg-transparent text-xs outline-none"
                  />
                  {catalogueFilter && (
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setCatalogueFilter("")}
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowCatalogueSearch(true)}
                  className="pill mono uppercase flex items-center gap-2 border border-foreground bg-background px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
                >
                  <Search className="h-4 w-4" /> Search
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="pill mono uppercase flex items-center gap-2 bg-foreground px-4 py-1.5 text-xs tracking-wider text-background transition hover:opacity-90">
                    <Plus className="h-4 w-4" /> New
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => newSet("song")} className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-blue)] focus:text-[var(--brand-white)]">
                    New Song
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => newSet("scripture")} className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-green)] focus:text-[var(--brand-white)]">
                    New Scripture
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => newSet("media")} className="mono uppercase text-xs tracking-wider focus:bg-[var(--brand-orange)] focus:text-[var(--brand-white)]">
                    New Media
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {catalogueRows.length === 0 ? (
            <div className="mono uppercase rounded-3xl border border-foreground p-10 text-center text-sm text-muted-foreground">
              {catalogueFilter.trim()
                ? `Nothing matches "${catalogueFilter}".`
                : emptyCategoryLabel[kindFilter]}
            </div>
          ) : (
            <div className="rounded-3xl border border-foreground p-4 max-h-[480px] overflow-y-auto catalogue-scroll">
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
          <p className="mono uppercase mt-10 text-xs text-muted-foreground">
            Tip: Drag a set into a gathering.
          </p>
        </section>
      </main>

      <Footer />

      {importedCount !== null && (
        <p>{importedCount} set{importedCount === 1 ? '' : 's'} imported successfully.</p>
      )}
      {importError && <p>{importError}</p>}

      <AlertDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">Sign out?</AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Any live sessions you've started will remain live and accessible to viewers until you end them.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => { setShowSignOutDialog(false); signOut(); }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setShowSignOutDialog(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showExportConfirm} onOpenChange={setShowExportConfirm}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">Export</AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            This will download all your sets as a .phyto file.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => { setShowExportConfirm(false); exportCatalogue(); }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
            >
              Download
            </button>
            <button
              type="button"
              onClick={() => setShowExportConfirm(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingImportFile !== null} onOpenChange={(open) => { if (!open) setPendingImportFile(null); }}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">Import</AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Merge adds and overwrites sets with the same name without deleting anything. Replace clears your current catalogue.
          </AlertDialogDescription>
          <div className="mt-8 flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleImport('merge')}
                className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
              >
                Merge
              </button>
              <button
                type="button"
                onClick={() => handleImport('replace')}
                className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
              >
                Replace
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPendingImportFile(null)}
              className="mono uppercase w-full rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GatheringCard({
  name,
  setIds,
  allSets,
  onRename,
  onDelete,
  onAdd,
  onRemoveAt,
  onReorder,
  gatheringId,
  isLive,
  shareToken,
  onGoLive,
  onEndSession,
}: {
  gatheringId: string;
  name: string;
  setIds: string[];
  isLive: boolean | null;
  shareToken: string;
  allSets: { id: string; name: string; kind: SetKind }[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onAdd: (setId: string) => void;
  onRemoveAt: (index: number) => void;
  onReorder: (ids: string[]) => void;
  onGoLive: () => Promise<void>;
  onEndSession: () => void;
}) {
  const dragIndex = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);
  const liveOrderRef = useRef<string[] | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [editingName, setEditingName] = useState(false);
  // Edit mode reveals destructive controls + the "search for a set" input.
  const [editMode, setEditMode] = useState(false);

  const isSignedIn = useIsSignedIn();
  const [showGoLiveDialog, setShowGoLiveDialog] = useState(false);
  const [showEndSessionDialog, setShowEndSessionDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [isGoingLive, setIsGoingLive] = useState(false);
  const [showShareQr, setShowShareQr] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [qrFg, setQrFg] = useState("#212121");
  const [qrBg, setQrBg] = useState("#ffffff");
  const [qrTransparent, setQrTransparent] = useState(false);
  const shareQrRef = useRef<HTMLCanvasElement>(null);
  const qrFgCustomRef = useRef<HTMLInputElement>(null);

  const QR_FG_PRESETS = qrTransparent
    ? ['#212121', '#F5EFEF', '#2E7299', '#538844', '#E07D31', '#C01E21']
    : qrBg === '#000000'
      ? ['#F5EFEF', '#2E7299', '#538844', '#E07D31', '#C01E21']
      : ['#212121', '#2E7299', '#538844', '#E07D31', '#C01E21'];

  const setQrBackground = (bg: string | null) => {
    if (bg === null) {
      setQrTransparent(true);
    } else {
      setQrTransparent(false);
      setQrBg(bg);
      if (bg === '#ffffff' && qrFg === '#F5EFEF') setQrFg('#212121');
      if (bg === '#000000' && qrFg === '#212121') setQrFg('#F5EFEF');
    }
  };

  const shareUrl = `${window.location.origin}/g/${shareToken}`;

  const downloadQr = (ref: React.RefObject<HTMLCanvasElement | null>, filename: string) => {
    const canvas = ref.current;
    if (!canvas) return;
    const padding = 20;
    const out = document.createElement('canvas');
    out.width = canvas.width + padding * 2;
    out.height = canvas.height + padding * 2;
    const ctx = out.getContext('2d')!;
    if (!qrTransparent) {
      ctx.fillStyle = qrBg;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.drawImage(canvas, padding, padding);
    const url = out.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

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
        if (draggingId !== null) { e.preventDefault(); return; }
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragLeave={(e) => {
        // Only clear the ring when the cursor truly leaves the card, not just moves to a child element.
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) return;
        setDropActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        // Internal reorder drops are handled by the <ol> — ignore them here.
        if (draggingId !== null) return;
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
            className="h-9 flex-1 border-foreground text-lg shadow-none focus-visible:ring-0"
          />
        ) : (
          <h3
            className={`flex items-center gap-2 flex-1 truncate text-2xl ${editMode ? "cursor-text" : ""}`}
            onClick={() => editMode && setEditingName(true)}
            title={editMode ? "Rename" : undefined}
          >
            {name}
          </h3>
        )}
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`pill flex items-center justify-center border border-foreground transition ${
            editMode ? "mono uppercase bg-foreground text-background px-4 py-1.5 text-xs tracking-wider" : "h-10 w-10 hover:bg-foreground hover:text-background"
          }`}
          title={editMode ? "Done editing" : "Edit"}
          aria-label={editMode ? "Done editing" : "Edit"}
        >
          {editMode ? "Done" : <Pencil className="h-4 w-4" />}
        </button>
        {!editMode && (
          <>
            <Link
              to="/present"
              search={{ gathering: gatheringId }}
              className="pill flex h-10 w-10 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
              title="Present gathering"
              aria-label="Present gathering"
            >
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            {isSignedIn && shareToken && (
              <button
                type="button"
                onClick={() => { setShowShareQr(false); setShowShareDialog(true); }}
                className="pill flex h-10 w-10 items-center justify-center border border-foreground transition hover:bg-foreground hover:text-background"
                title="Share gathering"
                aria-label="Share gathering"
              >
                <Share2 className="h-4 w-4" />
              </button>
            )}
            {isSignedIn && (
              isLive ? (
                <button
                  onClick={() => setShowEndSessionDialog(true)}
                  className="pill flex h-10 w-10 items-center justify-center bg-[var(--brand-red)] text-[var(--brand-white)] transition animate-pulse hover:animate-none [&>svg]:opacity-0 [&>svg]:transition-opacity [&>svg]:duration-200 hover:[&>svg]:opacity-100"
                  title="End session"
                  aria-label="End session"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => setShowGoLiveDialog(true)}
                  className="pill flex h-10 w-10 items-center justify-center border border-foreground transition hover:border-[var(--brand-red)] hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                  title="Go live"
                  aria-label="Go live"
                >
                  <Wifi className="h-4 w-4" />
                </button>
              )
            )}
          </>
        )}
        {editMode && (
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="pill flex h-10 w-10 items-center justify-center text-muted-foreground transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
            aria-label="Delete gathering"
            title="Delete gathering"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {setIds.length === 0 ? (
        <p className="mono uppercase rounded-2xl border border-dashed border-muted-foreground p-3 text-center text-xs text-muted-foreground">
          Drag a set in to add it to this gathering.
        </p>
      ) : (
        <ol
          className="flex flex-col gap-1"
          onDrop={(e) => {
            e.preventDefault();
            if (liveOrderRef.current) onReorder(liveOrderRef.current);
            liveOrderRef.current = null;
            setDraggingId(null);
            setLiveOrder(null);
            dragIndex.current = null;
          }}
        >
          {(liveOrder ?? setIds).map((id, i) => {
            const d = nameLookup[id];
            const isDragging = id === draggingId;
            const originalIndex = setIds.indexOf(id);
            return (
              <li
                key={`${id}-${i}`}
                draggable={editMode}
                onDragStart={(e) => {
                  setDraggingId(id);
                  dragIndex.current = i;
                  e.dataTransfer.effectAllowed = "move";
                  hideDragGhost(e);
                }}
                onDragEnd={() => {
                  if (liveOrderRef.current) onReorder(liveOrderRef.current);
                  liveOrderRef.current = null;
                  setDraggingId(null);
                  setLiveOrder(null);
                  dragIndex.current = null;
                }}
                onDragOver={(e) => {
                  if (dragIndex.current === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const currentOrder = liveOrder ?? setIds;
                  const currentFromIndex = currentOrder.indexOf(draggingId!);
                  if (currentFromIndex === i) return;
                  const next = [...currentOrder];
                  next.splice(currentFromIndex, 1);
                  next.splice(i, 0, draggingId!);
                  liveOrderRef.current = next;
                  setLiveOrder(next);
                }}
                className={`pill flex items-center gap-3 px-4 py-1.5 text-sm transition ${kindBg(d?.kind ?? "mixed")} ${
                  isDragging ? "ring-2 ring-foreground" : ""
                }`}
              >
                {editMode && <DotsGrip className="cursor-grab opacity-80" />}
                <span draggable={false} className="flex-1 truncate">{d?.name ?? "(missing)"}</span>
                <span draggable={false} className="mono text-[10px] uppercase tracking-wider opacity-90">
                  {d?.kind}
                </span>
                {editMode && (
                  <button
                    draggable={false}
                    onClick={() => onRemoveAt(originalIndex)}
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
              className="mono uppercase w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
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

      {/* Share dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          <DialogTitle className="text-2xl font-normal leading-tight">Share this gathering!</DialogTitle>

          <div className="mt-6 flex items-center gap-2">
            <div className="flex flex-1 items-center overflow-hidden rounded-full border border-foreground">
              <span className="flex-1 truncate px-4 font-mono uppercase text-sm text-muted-foreground">{shareUrl}</span>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(shareUrl); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2000); }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90"
                aria-label="Copy URL"
              >
                <span className="transition-all duration-300">
                  {copiedShare ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowShareQr((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90"
              aria-label="QR Code"
            >
              <QrCode className="h-4 w-4" />
            </button>
          </div>

          {showShareQr && (
            <div className="mt-4 flex flex-col items-center gap-3">
              <div
                className="rounded-xl p-4"
                style={qrTransparent ? {
                  backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                  backgroundSize: '10px 10px',
                  backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                } : { backgroundColor: qrBg }}
              >
                <QRCodeCanvas ref={shareQrRef} value={shareUrl} size={180} fgColor={qrFg} bgColor={qrTransparent ? 'transparent' : qrBg} />
              </div>
              <div className="flex flex-col gap-2 self-stretch">
                <div className="flex items-center gap-3">
                  <span className="w-28 font-mono text-xs uppercase text-foreground">Dots</span>
                  <div className="flex gap-1.5">
                    {QR_FG_PRESETS.map(c => (
                      <button key={c} type="button" onClick={() => setQrFg(c)}
                        className="h-7 w-7 rounded-full border-2 transition"
                        style={{ backgroundColor: c, borderColor: qrFg === c ? 'var(--foreground)' : 'color-mix(in srgb, var(--foreground) 20%, transparent)' }}
                      />
                    ))}
                    <button type="button" onClick={() => qrFgCustomRef.current?.click()}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--foreground) 20%, transparent)',
                        backgroundColor: QR_FG_PRESETS.includes(qrFg) ? 'transparent' : qrFg,
                        color: 'var(--foreground)',
                      }}
                    >
                      {QR_FG_PRESETS.includes(qrFg) && <span className="text-sm leading-none">+</span>}
                    </button>
                    <input ref={qrFgCustomRef} type="color" value={qrFg} onChange={e => setQrFg(e.target.value)} className="sr-only" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-28 font-mono text-xs uppercase text-foreground">Background</span>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setQrBackground('#000000')}
                      className="h-7 w-7 rounded-full border-2 transition"
                      style={{ backgroundColor: '#000000', borderColor: !qrTransparent && qrBg === '#000000' ? 'var(--foreground)' : 'color-mix(in srgb, var(--foreground) 20%, transparent)' }}
                    />
                    <button type="button" onClick={() => setQrBackground('#ffffff')}
                      className="h-7 w-7 rounded-full border-2 transition"
                      style={{ backgroundColor: '#ffffff', borderColor: !qrTransparent && qrBg === '#ffffff' ? 'var(--foreground)' : 'color-mix(in srgb, var(--foreground) 20%, transparent)' }}
                    />
                    <button type="button" onClick={() => setQrBackground(null)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition overflow-hidden"
                      style={{ borderColor: qrTransparent ? 'var(--foreground)' : 'color-mix(in srgb, var(--foreground) 20%, transparent)', padding: 0 }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" style={{ display: 'block' }}>
                        <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="#212121"/>
                        <path d="M12 22 A10 10 0 0 1 12 2 Z" fill="#F5EFEF"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadQr(shareQrRef, `${name}-qr.png`)}
                className="mono uppercase rounded-full border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
              >
                Download
              </button>
            </div>
          )}

          {!isLive && (
            <p className="mt-6 text-sm text-muted-foreground">
              Once live, this gathering will be accessible via this link.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Go Live confirmation dialog */}
      <Dialog open={showGoLiveDialog} onOpenChange={(open) => { if (isGoingLive) return; setShowGoLiveDialog(open); }}>
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          <DialogTitle className="text-2xl font-normal leading-tight">Go live!</DialogTitle>

          <p className="mt-4 text-base">
            This gathering will stay live until you end it or start a new one.
          </p>

          <div className="mt-8">
            <button
              onClick={async () => { setIsGoingLive(true); await onGoLive(); setIsGoingLive(false); setShowGoLiveDialog(false); setShowShareQr(false); setShowShareDialog(true); }}
              disabled={isGoingLive}
              className="mono uppercase w-full rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90 disabled:opacity-70"
            >
              {isGoingLive ? "Going Live..." : "Go Live"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* End Session confirmation dialog */}
      <AlertDialog open={showEndSessionDialog} onOpenChange={setShowEndSessionDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">End this session?</AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Ending the session will take this gathering offline. You can go live again at any time.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => { onEndSession(); setShowEndSessionDialog(false); }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
            >
              End Session
            </button>
            <button
              type="button"
              onClick={() => setShowEndSessionDialog(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete gathering confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">Delete this gathering?</AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            This will permanently delete this gathering. This cannot be undone.
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => { onDelete(); setShowDeleteDialog(false); }}
              className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              Cancel
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
