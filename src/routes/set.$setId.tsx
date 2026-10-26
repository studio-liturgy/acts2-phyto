import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { touchReorder } from "@/lib/touch-reorder";
import { PhoneDock, PhoneFold } from "@/components/phone/PhoneChrome";
import { DotsGrip } from "@/components/DragBits";
import { useLibrary, useSongTemplateDraft, useScriptureTemplateDraft } from "@/lib/store";
import { SongTemplateEditor } from "@/components/SongTemplateEditor";
import { ScriptureTemplateEditor } from "@/components/ScriptureTemplateEditor";
import { groupSlides, moveSlideKeepingSections } from "@/lib/sections";
import { MediaTemplateEditor } from "@/components/MediaTemplateEditor";
import { parseYouTubeId } from "@/lib/parsers";
import { applyDividers, breakCount } from "@/lib/apply-dividers";
import { supabase } from "@/lib/supabase";
import {
  IMAGE_MAX_DIM,
  IMAGE_QUALITY,
  MEDIA_MAX_BYTES,
  isUploadableImage,
  isUploadableVideo,
} from "@/lib/media";
import { prepareImageFile, prepareRenderedImage } from "@/lib/image-upload";
import { useScriptureVersions } from "@/hooks/use-scripture-versions";
import { audienceLabel, useSetAudience } from "@/hooks/use-set-audience";
import { languagesOfVersions, visibleVersions } from "@/lib/versions";
import { searchSongs, preloadSongs, parseQuery, songPreview, type SongResult } from "@/lib/songs";
import {
  lyricsToSlides,
  parseScriptureFromText,
  reconcileSlideIds,
  slidesToLyricsText,
  slidesToScriptureText,
} from "@/lib/slide-text";
import { SlideView } from "@/components/SlideView";
import { PhoneSetTabs } from "@/components/phone/PhoneSetTabs";
import { usePhoneLayout } from "@/hooks/use-phone-layout";
import { ExportGatheringButton } from "@/components/ExportGatheringButton";
import { AddElementBar, MessageElements } from "@/components/MessageElements";
import { MessageBlockEditor } from "@/components/MessageBlockEditor";
import { ScriptureVerseEditor } from "@/components/ScriptureVerseEditor";
import { VersionPicker } from "@/components/VersionPicker";
import { ScriptureSettingsDialog } from "@/components/ScriptureSettingsDialog";
import { SongModeDialog, type ModeQuestion } from "@/components/SongModeDialog";
import { SongModePicker } from "@/components/SongModePicker";
import { useSongModeRequest } from "@/lib/song-mode-request";
import { useGridChordBus } from "@/lib/grid-chord-bus";
import { ResponseLyricEditor } from "@/components/ResponseLyricEditor";
import {
  attachRoles,
  lyricLineRoles,
  plainSongSlides,
  remapRoles,
  rolesForLyricLines,
  rolesFromSlides,
  type LineRoles,
} from "@/lib/song-roles";
import { songLayoutOf, type SongLayout } from "@/lib/song-layout";
import { MultiLangLyricEditor } from "@/components/MultiLangLyricEditor";
import { SongLanguageBar } from "@/components/SongLanguageBar";
import {
  MAX_LANG_LINES_PER,
  langLinesPer,
  langToKeep,
  leaveMultilang,
  returnToMultilang,
  rowsToSlides,
  divideRows,
  slidesToRows,
  shownLangs,
  standardToRows,
  transposeLangColumn,
} from "@/lib/multiling";
import { langColor, langDef, type LangCode } from "@/lib/langs";
import { phoneLangPair, tapPairLang } from "@/lib/phone-layout";
import { usePhoneEditorBus, useRegisterPhoneUndo } from "@/lib/phone-editor-bus";
import { VersionWarning } from "@/components/VersionWarning";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PillSwitch } from "@/components/PillSwitch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChordLine } from "@/components/ChordLine";
import {
  boxOffsetLine,
  breakLineAtBoxOffset,
  chordProKey,
  chordToNumber,
  clearChordsAtBoxOffset,
  diatonicChords,
  stripChords,
  hideChords,
  inlineToChordRows,
  insertChordAtBoxOffset,
  isNumberToken,
  looksLikeNumberChordStream,
  caretAfterLyricEdit,
  caretAfterRowEdit,
  lyricCaretForStoredLine,
  normaliseKeyTag,
  numberToChord,
  readChordRows,
  reapplyChords,
  guessKey,
  hasChords,
  KEYS,
  normaliseChordSheet,
  renderChord,
  transposeLyrics,
  type SongChords,
} from "@/lib/chords";
import {
  ArrowUpLeft,
  ArrowUpRight,
  Plus,
  Trash2,
  Maximize2,
  Minimize2,
  Search,
  Loader2,
  ChevronDown,
  ArrowLeftRight,
  X,
  ChevronUp,
  Share2,
  Settings,
  ImagePlus,
  SeparatorHorizontal,
  Undo2,
} from "lucide-react";
import { NumberStepper } from "@/components/NumberStepper";
import { useIsSignedIn } from "@/lib/authStore";
import { ShareSetDialog } from "@/components/ShareSetDialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Slide, SetKind } from "@/lib/types";
import { z } from "zod";
import { APP_NAME } from "@/lib/appConfig";
import { resolveSetRekey } from "@/lib/set-rekey";
import { setRemoveMode } from "@/lib/group-catalogue";

const searchSchema = z.object({
  redirectTo: z
    .string()
    .optional()
    .transform((s) =>
      typeof s === "string" && s.startsWith("/") && !s.startsWith("//") ? s : undefined,
    ),
});

export const Route = createFileRoute("/set/$setId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: `Set Editor | ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: SetEditor,
});

// Message scripture verses key off a bible version. Only one is surfaced today
// (the second translation is hidden until dual-translation ships), so the block
// editor is driven with a single placeholder version.
const SINGLE_VERSION = ["_"];

/** The names a new set is created with: clicking into one starts blank. */
const DEFAULT_SET_NAMES = new Set(["New Song", "New Scripture", "New Media"]);

function kindBadgeBg(kind: SetKind): string {
  if (kind === "song") return "bg-[var(--brand-blue)] text-[var(--brand-white)]";
  if (kind === "scripture") return "bg-[var(--brand-green)] text-[var(--brand-white)]";
  if (kind === "message") return "bg-[var(--brand-green-dark)] text-[var(--brand-white)]";
  if (kind === "media") return "bg-[var(--brand-orange)] text-[var(--brand-white)]";
  return "bg-muted text-foreground";
}

function PanelCard({
  label,
  className = "",
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-3xl border border-foreground bg-background p-5 ${className}`}>
      {label && <h3 className="mono mb-4 text-xs uppercase tracking-wider">{label}</h3>}
      {children}
    </section>
  );
}

function SetHeader({
  phytoSet,
  redirectTo,
  editingName,
  setEditingName,
  updateSet,
  navigate,
  deleteSet,
  phone = false,
}: {
  /** The phone layout's header: Back, the name, Delete and Share, then the
   *  kind, song mode and Add to a gathering on a row under it. */
  phone?: boolean;
  phytoSet: {
    id: string;
    name: string;
    kind: SetKind;
    shared?: boolean;
    shared_by?: string;
    groupIds?: string[];
    versions?: string[];
    slides: Slide[];
  };
  redirectTo?: string;
  editingName: boolean;
  setEditingName: (v: boolean | ((prev: boolean) => boolean)) => void;
  updateSet: (id: string, patch: object) => void;
  navigate: ReturnType<typeof useNavigate>;
  deleteSet: (id: string) => void;
}) {
  const [showDeleteSetDialog, setShowDeleteSetDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const isSignedIn = useIsSignedIn();
  const groups = useLibrary((s) => s.groups);
  const activeWorkspace = useLibrary((s) => s.activeWorkspace);
  // Refetched when the share dialog closes, so the header follows a change.
  const audience = useSetAudience(phytoSet, showShareDialog);
  const unshareSetFromGroup = useLibrary((s) => s.unshareSetFromGroup);
  // What the destructive action means here:
  // (see setRemoveMode). The group admin can also retract someone else's set
  // from the group; other members can't remove sets they don't own.
  const isActiveGroupAdmin = groups.find((g) => g.id === activeWorkspace)?.role === "admin";
  const removeMode = setRemoveMode({
    shared: !!phytoSet.shared,
    groupIds: phytoSet.groupIds ?? [],
    activeWorkspace,
    isActiveGroupAdmin,
  });
  const removeLabel = removeMode === "delete" ? "Delete" : "Remove";
  const nameBeforeEditRef = useRef(phytoSet.name);
  // A new set's placeholder name ("New Song") isn't something to edit around:
  // clicking in shows an empty field (the name as its placeholder), and the
  // name only changes once something is typed.
  const [blankDefault, setBlankDefault] = useState(false);
  const commitName = () => {
    if (!phytoSet.name.trim()) {
      updateSet(phytoSet.id, { name: nameBeforeEditRef.current });
    }
    setBlankDefault(false);
    setEditingName(false);
  };
  // Gathering this set was added to during this edit session; the Present button
  // jumps there instead of presenting the set on its own. Most recent wins.
  const [presentGatheringId, setPresentGatheringId] = useState<string | null>(null);
  // Opened from the presenter — Back returns there, and we hide Present so the
  // only way out is Back (to wherever they came from).
  const fromPresenter = !!redirectTo?.startsWith("/present");
  // Phone: the + beside Share turns the title row into the gathering search.
  const [addingTo, setAddingTo] = useState(false);
  const setScriptureSettings = usePhoneEditorBus((s) => s.setScriptureSettings);
  const phoneUndo = usePhoneEditorBus((s) => s.undo);
  const deleteDialog = (
    <AlertDialog open={showDeleteSetDialog} onOpenChange={setShowDeleteSetDialog}>
      <AlertDialogContent className="gap-0 rounded-3xl p-8">
        <AlertDialogTitle className="text-2xl font-normal leading-tight">
          {removeMode === "remove-shared"
            ? "Remove this shared set?"
            : removeMode === "remove-group" || removeMode === "remove-group-admin"
              ? "Remove this set from the group?"
              : "Delete this set?"}
        </AlertDialogTitle>
        <AlertDialogDescription className="mt-4 text-base text-foreground">
          {removeMode === "remove-shared"
            ? `This removes you from “${phytoSet.name}” completely. You'll lose access, and it won't come back unless the owner shares it with you again.`
            : removeMode === "remove-group"
              ? "Remove the set out of the group and its gatherings. It stays in your personal catalogue."
              : removeMode === "remove-group-admin"
                ? "This takes the set out of the group and its gatherings. It stays in its owner's personal catalogue."
                : "This cannot be undone."}
        </AlertDialogDescription>
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => {
              if (removeMode === "remove-group" || removeMode === "remove-group-admin") {
                unshareSetFromGroup(phytoSet.id, activeWorkspace);
              } else {
                deleteSet(phytoSet.id);
              }
              navigate({ to: redirectTo ?? "/" });
            }}
            className="mono uppercase flex-1 rounded-full bg-[var(--brand-red)] py-2 text-sm text-[var(--brand-white)] transition hover:opacity-90"
          >
            {removeLabel}
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteSetDialog(false)}
            className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
          >
            Cancel
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
  const shareDialog = showShareDialog && (
    <ShareSetDialog
      open={showShareDialog}
      onOpenChange={setShowShareDialog}
      setId={phytoSet.id}
      setName={phytoSet.name}
      groups={groups}
    />
  );
  const titleEl = editingName ? (
    <Input
      autoFocus
      value={blankDefault ? "" : phytoSet.name}
      placeholder={blankDefault ? phytoSet.name : "Set name"}
      onChange={(e) => {
        setBlankDefault(false);
        updateSet(phytoSet.id, { name: e.target.value });
      }}
      onBlur={commitName}
      onKeyDown={(e) => e.key === "Enter" && commitName()}
      className="h-9 w-56 border-foreground text-base shadow-none focus-visible:ring-0"
    />
  ) : (
    <h1
      onClick={() => {
        nameBeforeEditRef.current = phytoSet.name;
        setBlankDefault(DEFAULT_SET_NAMES.has(phytoSet.name.trim()));
        setEditingName(true);
      }}
      className="cursor-text truncate text-base text-muted-foreground"
      title="Click to rename"
    >
      {phytoSet.name}
    </h1>
  );
  if (phone) {
    const ICON = "pill flex h-10 w-10 shrink-0 items-center justify-center transition";
    return (
      <header className="shrink-0 border-b border-foreground px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <Link
            to={redirectTo ?? "/?tab=catalogue"}
            className="pill flex h-9 w-9 shrink-0 items-center justify-center bg-foreground text-background transition active:opacity-80"
            title="Back"
            aria-label="Back"
          >
            <ArrowUpLeft className="h-5 w-5" />
          </Link>
          {addingTo ? (
            <PhoneAddToGathering setId={phytoSet.id} onClose={() => setAddingTo(false)} />
          ) : (
            <>
              {/* The name, then its kind's dot. */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="flex min-w-0 items-center">{titleEl}</div>
                <span
                  aria-label={phytoSet.kind}
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: kindColor(phytoSet.kind) }}
                />
                <VersionWarning set={phytoSet} hint="Re-import or duplicate to unfreeze." />
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {phoneUndo && (
                  <button
                    onClick={phoneUndo}
                    className={`${ICON} active:bg-foreground/15`}
                    title="Undo"
                    aria-label="Undo"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                )}
                {removeMode && (
                  <button
                    onClick={() => setShowDeleteSetDialog(true)}
                    className={`${ICON} active:bg-[var(--brand-red)] active:text-[var(--brand-white)]`}
                    title={removeLabel}
                    aria-label={removeLabel}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                {/* No Share here on the phone: sets are shared from the catalogue. */}
                <button
                  onClick={() => setAddingTo(true)}
                  className={`${ICON} active:bg-foreground/15`}
                  title="Add to a gathering"
                  aria-label="Add to a gathering"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {(phytoSet.kind === "scripture" || phytoSet.kind === "message") && (
                  <button
                    onClick={() => setScriptureSettings(true)}
                    className={`${ICON} active:bg-foreground/15`}
                    title="Settings"
                    aria-label="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          )}
          {deleteDialog}
          {shareDialog}
        </div>
        {phytoSet.shared && (
          <p className="mono mt-2 truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            Shared by {phytoSet.shared_by ?? "someone"}
          </p>
        )}
      </header>
    );
  }
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-foreground px-6 py-4">
      {/* Back */}
      <Link
        to={redirectTo ?? "/"}
        className="pill flex h-10 w-10 shrink-0 items-center justify-center bg-foreground text-background transition hover:opacity-90"
        title="Back"
        aria-label="Back"
      >
        <ArrowUpLeft className="h-5 w-5" />
      </Link>

      {/* Title + badge */}
      <div className="flex min-w-0 items-center gap-2">
        {titleEl}

        <span
          className={`pill mono shrink-0 px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${kindBadgeBg(phytoSet.kind)}`}
        >
          {phytoSet.kind}
        </span>
        {phytoSet.kind === "song" && <SongModePicker setId={phytoSet.id} />}
        <VersionWarning set={phytoSet} hint="Re-import or duplicate to unfreeze." />

        {/* Who else sees it: the owner of a set shared with me, or, for my
            own set viewed in Personal, the groups and people it's shared with. */}
        {phytoSet.shared ? (
          <span className="mono shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
            Shared by {phytoSet.shared_by ?? "someone"}
          </span>
        ) : (
          activeWorkspace === "personal" &&
          audienceLabel(audience) && (
            <span
              className="mono min-w-0 truncate text-[10px] uppercase tracking-wider text-muted-foreground"
              title={`Shared with ${audienceLabel(audience)}`}
            >
              Shared with{" "}
              {[...audience.groups, ...audience.people].map((name, i, all) => (
                <Fragment key={name}>
                  <span className={audience.groups.includes(name) ? "normal-case" : ""}>
                    {name}
                  </span>
                  {i < all.length - 2 ? ", " : i === all.length - 2 ? " and " : ""}
                </Fragment>
              ))}
            </span>
          )
        )}
      </div>

      <div className="flex-1" />

      {/* Right actions. A set shared into a group belongs to its owner: other
          members can edit it but can't remove it (the owner or the group admin
          retracts it). */}
      {/* Delete, Share and Export: plain icons, grouped tight. */}
      <div className="flex shrink-0 items-center gap-0.5">
        {removeMode && (
          <button
            onClick={() => setShowDeleteSetDialog(true)}
            className="pill flex h-10 w-10 shrink-0 items-center justify-center transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
            title={removeLabel}
            aria-label={removeLabel}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        {deleteDialog}
        {isSignedIn && !phytoSet.shared && (
          <button
            onClick={() => setShowShareDialog(true)}
            className="pill flex h-10 w-10 shrink-0 items-center justify-center transition hover:bg-foreground hover:text-background"
            title="Share set"
            aria-label="Share set"
          >
            <Share2 className="h-4 w-4" />
          </button>
        )}
        {shareDialog}
        {/* Export this set as PDF or PPTX (the gathering export's dialog). */}
        <ExportGatheringButton setId={phytoSet.id} />
      </div>
      <AddToGathering setId={phytoSet.id} onAdded={setPresentGatheringId} />
      {!fromPresenter && (
        <button
          onClick={() =>
            navigate({
              to: "/present",
              search: presentGatheringId ? { gathering: presentGatheringId } : { set: phytoSet.id },
            })
          }
          className="pill mono uppercase flex shrink-0 items-center gap-2 border border-foreground px-5 py-2 text-sm transition hover:bg-foreground hover:text-background"
        >
          Present <ArrowUpRight className="h-4 w-4" />
        </button>
      )}
    </header>
  );
}

function SetEditor() {
  const phone = usePhoneLayout();
  const { setId } = Route.useParams();
  const { redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const phytoSet = useLibrary((s) => s.sets[setId]);
  // Sync moved this set to a fresh id (its old id belonged to a row this
  // account can't write): follow it to the new address.
  const movedTo = useLibrary((s) => {
    if (s.sets[setId]) return null;
    const id = resolveSetRekey(setId);
    return id && s.sets[id] ? id : null;
  });
  useEffect(() => {
    if (!movedTo) return;
    navigate({
      to: "/set/$setId",
      params: { setId: movedTo },
      search: { redirectTo },
      replace: true,
    });
  }, [movedTo, navigate, redirectTo]);
  const { updateSet, addSlide, updateSlide, removeSlide, reorderSlides, deleteSet } = useLibrary();
  const songTemplate = useLibrary((s) => s.songTemplate);
  const songDraft = useSongTemplateDraft((s) => s.draft);
  const effectiveTemplate = songDraft ?? songTemplate;
  const scriptureTemplate = useLibrary((s) => s.scriptureTemplate);
  const scriptureDraft = useScriptureTemplateDraft((s) => s.draft);
  const effectiveScriptureTemplate = scriptureDraft ?? scriptureTemplate;

  // A message with no points or images left is just a scripture set again: flip
  // it back so it drops the block editor and returns to the plain textarea.
  useEffect(() => {
    if (phytoSet?.kind !== "message") return;
    const hasElements = phytoSet.slides.some((s) => s.kind === "point" || s.kind === "image");
    if (!hasElements) updateSet(phytoSet.id, { kind: "scripture" });
  }, [phytoSet?.kind, phytoSet?.slides, phytoSet?.id, updateSet]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  // The media editor's "Add image" picker.
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const [groupView, setGroupView] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [showFileSizeDialog, setShowFileSizeDialog] = useState(false);
  const [showStorageLimitDialog, setShowStorageLimitDialog] = useState(false);
  const [fileOver, setFileOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoLink, setVideoLink] = useState("");
  const [videoErr, setVideoErr] = useState<string | null>(null);

  const selected = useMemo(
    () => phytoSet?.slides.find((s) => s.id === selectedId) ?? phytoSet?.slides[0] ?? null,
    [phytoSet, selectedId],
  );

  useEffect(() => {
    if (!phytoSet) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = phytoSet.slides.findIndex((s) => s.id === (selected?.id ?? ""));
        const next = phytoSet.slides[Math.min(phytoSet.slides.length - 1, idx + 1)];
        if (next) {
          setSelectedId(next.id);
          setMultiSel(new Set([next.id]));
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = phytoSet.slides.findIndex((s) => s.id === (selected?.id ?? ""));
        const prev = phytoSet.slides[Math.max(0, idx - 1)];
        if (prev) {
          setSelectedId(prev.id);
          setMultiSel(new Set([prev.id]));
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (multiSel.size > 0) {
          e.preventDefault();
          multiSel.forEach((id) => removeSlide(phytoSet.id, id));
          setMultiSel(new Set());
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phytoSet, selected, multiSel, removeSlide]);

  if (!phytoSet) {
    if (movedTo) return null;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Set not found.</p>
          <Link to="/" className="mt-3 inline-block underline">
            Back to catalogue
          </Link>
        </div>
      </div>
    );
  }

  const headerProps = {
    phytoSet,
    redirectTo,
    editingName,
    setEditingName,
    updateSet,
    navigate,
    deleteSet,
  };

  // Song: full-page two-column layout
  if (phytoSet.kind === "song") {
    const songSlides =
      phytoSet.slides.length === 0 ? (
        <p className="mono uppercase py-16 text-center text-xs tracking-wider text-muted-foreground">
          Slides will appear here as you type
        </p>
      ) : (
        (() => {
          const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
          const groups: { label: string | undefined; slides: Slide[] }[] = [];
          for (const s of phytoSet.slides) {
            const last = groups[groups.length - 1];
            if (!last || s.section !== last.label) {
              groups.push({ label: s.section, slides: [s] });
            } else {
              last.slides.push(s);
            }
          }
          return (
            <div className="space-y-4">
              {groups.map((g, gi) => (
                <div key={gi}>
                  {g.label && (
                    <div className="mono mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </div>
                  )}
                  <div
                    className="rounded-xl p-2"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${TINTS[gi % 3]} 45%, transparent)`,
                    }}
                  >
                    {/* Multilanguage (1/4 width, as on watch): one slide per
                      row, numbered like the grid. */}
                    <div
                      className={`grid ${phytoSet.songLayout === "multilang" || phone ? "grid-cols-1" : "grid-cols-2"} gap-2`}
                    >
                      {g.slides.map((s) => (
                        <div key={s.id} className="relative overflow-hidden rounded-md">
                          {phytoSet.songLayout === "multilang" && (
                            <span className="mono absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] tabular-nums text-white">
                              {phytoSet.slides.findIndex((x) => x.id === s.id) + 1}
                            </span>
                          )}
                          <SlideView slide={s} variant="thumb" template={effectiveTemplate} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      );
    if (phone) {
      return (
        <PhoneSetTabs
          set={phytoSet}
          header={<SetHeader {...headerProps} phone />}
          editor={<Importers key={phytoSet.id} setId={phytoSet.id} kind={phytoSet.kind} phone />}
          slides={
            <>
              {phytoSet.songLayout === "multilang" && (phytoSet.langs?.length ?? 0) > 0 && (
                <div className="mb-4">
                  <div className="mono mb-2 text-[10px] uppercase tracking-wider opacity-60">
                    Languages on slide
                  </div>
                  <SongLanguageBar set={phytoSet} />
                </div>
              )}
              {songSlides}
            </>
          }
        />
      );
    }
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <SetHeader {...headerProps} />
        <div className="flex min-h-0 flex-1 divide-x divide-foreground">
          {/* Left: song editor. Multilanguage takes 3/4, as on watch, so the
              grid has room for its columns. */}
          <div
            className={`flex ${phytoSet.songLayout === "multilang" ? "w-3/4" : "w-1/2"} min-h-0 flex-col overflow-hidden`}
          >
            {/* Keyed so navigating straight to another song remounts the editor.
                Without it the box would keep the previous song's lyrics and the
                live-sync effect would write them over the new song's slides. */}
            <Importers key={phytoSet.id} setId={phytoSet.id} kind={phytoSet.kind} />
          </div>
          {/* Right: template editor + live slide grid */}
          <div
            className={`${phytoSet.songLayout === "multilang" ? "w-1/4" : "w-1/2"} overflow-y-auto px-6 pb-6 pt-4`}
          >
            {phytoSet.chords && !phytoSet.chords.hidden && phytoSet.slides.length > 0 && (
              <ChordSheet slides={phytoSet.slides} chords={phytoSet.chords} />
            )}
            {/* Multilanguage: which languages the slides show (same chips as
                the presenter's). */}
            {phytoSet.songLayout === "multilang" && (phytoSet.langs?.length ?? 0) > 0 && (
              <div className="mb-4">
                <div className="mono mb-2 text-[10px] uppercase tracking-wider opacity-60">
                  Languages on slide
                </div>
                <SongLanguageBar set={phytoSet} />
              </div>
            )}
            {phytoSet.slides.length > 0 && (
              <div className="mb-4">
                <SongTemplateEditor />
              </div>
            )}
            {songSlides}
          </div>
        </div>
      </div>
    );
  }

  // Scripture / message: full-page two-column layout (mirrors song layout). A
  // message is a scripture set that also carries images and points.
  if (phytoSet.kind === "scripture" || phytoSet.kind === "message") {
    const scriptureSlides =
      phytoSet.slides.length === 0 ? (
        <p className="mono uppercase py-16 text-center text-xs tracking-wider text-muted-foreground">
          Slides will appear here
        </p>
      ) : (
        (() => {
          const TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];
          // One coloured group per block, matching the editor: each scripture
          // section is its own group; a run of consecutive points is one group
          // and a run of consecutive images is a separate group.
          const groups: { label: string | undefined; slides: Slide[] }[] = [];
          let lastKey: string | undefined;
          for (const s of phytoSet.slides) {
            // A scripture group is one IMPORT (the same passage imported
            // twice is two groups, as on the left), not one reference.
            const key =
              s.kind === "image"
                ? "images"
                : s.kind === "point"
                  ? "points"
                  : s.kind === "scripture" && s.importIndex !== undefined
                    ? `import:${s.importIndex}`
                    : (s.section ?? "");
            const last = groups[groups.length - 1];
            if (!last || key !== lastKey) {
              groups.push({ label: s.reference ?? s.section, slides: [s] });
            } else {
              last.slides.push(s);
            }
            lastKey = key;
          }
          return (
            <div className="space-y-4">
              {groups.map((g, gi) => (
                <div key={gi}>
                  {g.label && (
                    <div className="mono mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </div>
                  )}
                  <div
                    className="rounded-xl p-2"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${TINTS[gi % 3]} 45%, transparent)`,
                    }}
                  >
                    <div className={`grid ${phone ? "grid-cols-1" : "grid-cols-2"} gap-2`}>
                      {g.slides.map((s) => (
                        <div key={s.id} className="overflow-hidden rounded-md">
                          <SlideView
                            slide={s}
                            versions={visibleVersions(phytoSet)}
                            variant="thumb"
                            template={effectiveScriptureTemplate}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      );
    if (phone) {
      return (
        <PhoneSetTabs
          set={phytoSet}
          header={<SetHeader {...headerProps} phone />}
          editor={<Importers key={phytoSet.id} setId={phytoSet.id} kind={phytoSet.kind} phone />}
          slides={scriptureSlides}
        />
      );
    }
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <SetHeader {...headerProps} />
        <div className="flex min-h-0 flex-1 divide-x divide-foreground">
          {/* Left: the importer stays persistent; below it a plain scripture
              shows its imported verses (editable) with the add-an-element bar,
              and a message shows the draggable block editor. All inside Importers.
              Keyed so navigating straight to another set remounts the editor. */}
          <div className="flex w-1/2 min-h-0 flex-col overflow-hidden">
            <Importers key={phytoSet.id} setId={phytoSet.id} kind={phytoSet.kind} />
          </div>
          {/* Right: template editor + live slide grid */}
          <div className="w-1/2 overflow-y-auto px-6 pb-6 pt-4">
            {phytoSet.slides.length > 0 && (
              <div className="mb-4">
                <ScriptureTemplateEditor />
              </div>
            )}
            {scriptureSlides}
          </div>
        </div>
      </div>
    );
  }

  // Media: merged import + slides panel
  const dense = phytoSet.slides.length > 20;

  // Single-select only: modifier-click no longer extends a selection (multi-select
  // was removed from the media editor). multiSel always mirrors the one selection
  // so the existing Delete-key and highlight paths keep working unchanged.
  const handleSelect = (id: string) => {
    setSelectedId(id);
    setMultiSel(new Set([id]));
  };

  // Uploads a single video file to R2 via the server route, then adds a slide
  // pointing at the returned public URL. Returns false on any failure.
  const uploadVideoFile = async (file: File): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setVideoErr("Please sign in to upload videos.");
      return false;
    }
    try {
      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type },
        body: file,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        url?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok || !json.ok || !json.url) {
        if (json.code === "quota") {
          setShowStorageLimitDialog(true);
        } else {
          setVideoErr(json.error ?? "Upload failed.");
        }
        return false;
      }
      addSlide(phytoSet.id, { kind: "video", videoSource: "file", videoUrl: json.url, lines: [] });
      return true;
    } catch {
      setVideoErr("Upload failed.");
      return false;
    }
  };

  // Adds a video slide from a pasted link: YouTube → embed, otherwise a direct
  // external video URL.
  const addVideoLink = () => {
    const link = videoLink.trim();
    if (!link) return;
    setVideoErr(null);
    const youtubeId = parseYouTubeId(link);
    if (youtubeId) {
      addSlide(phytoSet.id, { kind: "video", videoSource: "youtube", youtubeId, lines: [] });
    } else if (/^https?:\/\//i.test(link)) {
      addSlide(phytoSet.id, { kind: "video", videoSource: "url", videoUrl: link, lines: [] });
    } else {
      setVideoErr("Enter a YouTube link or a direct video URL.");
      return;
    }
    setVideoLink("");
  };

  const handleMediaFiles = async (files: FileList | null) => {
    if (!files || converting || uploading) return;
    setVideoErr(null);
    const all = Array.from(files);
    const videoFiles = all.filter((f) => isUploadableVideo(f.type));
    const nonVideo = all.filter((f) => !isUploadableVideo(f.type));

    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (
      nonVideo.some((f) => f.size > MAX_FILE_SIZE) ||
      videoFiles.some((f) => f.size > MEDIA_MAX_BYTES)
    ) {
      setShowFileSizeDialog(true);
      return;
    }

    if (videoFiles.length > 0) {
      setUploading(true);
      for (const file of videoFiles) {
        await uploadVideoFile(file);
      }
      setUploading(false);
    }

    const imageFiles = nonVideo.filter((f) => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type));
    const pdfFiles = nonVideo.filter((f) => f.type === "application/pdf");

    if (imageFiles.length > 0) {
      setUploading(true);
      for (const file of imageFiles) {
        const img = await prepareImageFile(file, () => setShowStorageLimitDialog(true));
        if (img) addSlide(phytoSet.id, { kind: "image", imageUrl: img.url, lines: [] });
      }
      setUploading(false);
    }

    if (pdfFiles.length > 0) {
      setConverting(true);
      for (const pdf of pdfFiles) {
        try {
          for (const blob of await pdfToImageBlobs(pdf)) {
            const img = await prepareRenderedImage(blob, () => setShowStorageLimitDialog(true));
            if (img) addSlide(phytoSet.id, { kind: "image", imageUrl: img.url, lines: [] });
          }
        } catch {
          // skip failed files silently
        }
      }
      setConverting(false);
    }
  };

  const mediaImages = phytoSet.slides.filter((sl) => sl.kind === "image");
  const hasImages = mediaImages.length > 0;
  const allCover = hasImages && mediaImages.every((sl) => sl.imageFit === "cover");
  const fitAllImages = () => {
    const nextFit = allCover ? "contain" : "cover";
    updateSet(phytoSet.id, {
      slides: phytoSet.slides.map((sl) =>
        sl.kind === "image" ? { ...sl, imageFit: nextFit } : sl,
      ),
    });
  };
  const addMediaSection = () => {
    // The selected slide (or the last one) opens the new section:
    // the divider goes on the slide before it. The first slide
    // already opens the first section; on a set with no sections
    // yet, that makes the whole set one (named) section.
    const slides = phytoSet.slides;
    const at = selected ? slides.findIndex((sl) => sl.id === selected.id) : slides.length - 1;
    if (at < 0) return;
    if (at === 0) {
      if (slides[0].sectionBefore === undefined) {
        updateSet(phytoSet.id, {
          slides: slides.map((sl, i) => (i === 0 ? { ...sl, sectionBefore: "" } : sl)),
        });
      }
      return;
    }
    const before = slides[at - 1];
    if (before.sectionAfter !== undefined) return;
    updateSet(phytoSet.id, {
      slides: slides.map((sl) => (sl.id === before.id ? { ...sl, sectionAfter: "" } : sl)),
    });
  };
  const ICONBTN =
    "pill flex h-9 w-9 shrink-0 items-center justify-center transition active:bg-foreground/15 disabled:opacity-40";
  /* Left (1/2): import controls, then the slides grid. Mirrors the song and
          scripture editors — a shrink-0 controls header over a scrollable body,
          no rounded panel. The whole column is the drop target. */
  const mediaLeft = (
    <div
      className={`flex ${phone ? "h-full w-full" : "w-1/2"} min-h-0 flex-col overflow-hidden transition ${
        fileOver ? "ring-2 ring-inset ring-foreground" : ""
      }`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setFileOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setFileOver(false);
        if (e.dataTransfer.files?.length) handleMediaFiles(e.dataTransfer.files);
      }}
    >
      <div className="shrink-0 border-b border-foreground/20 p-4">
        <div className="flex items-center gap-0.5">
          <div className="pill flex min-w-0 flex-1 items-center gap-2 border border-foreground bg-background px-3 py-1.5">
            <input
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addVideoLink();
                }
              }}
              placeholder="PASTE A YOUTUBE OR VIDEO LINK"
              className="mono w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={addVideoLink}
              disabled={!videoLink.trim()}
              className="flex items-center transition disabled:opacity-20"
              aria-label="Add video link"
            >
              <Plus className="h-4 w-4 opacity-40 hover:opacity-100" />
            </button>
          </div>
          {/* Phone: Add image (outlined, right of the link), Fit and Section on the link's row. */}
          {phone && (
            <>
              <span className="w-1.5 shrink-0" />
              <button
                type="button"
                onClick={() => mediaFileRef.current?.click()}
                disabled={converting || uploading}
                className={`${ICONBTN} border border-foreground`}
                title="Add image"
                aria-label="Add image"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              {hasImages && (
                <button
                  type="button"
                  onClick={fitAllImages}
                  className={ICONBTN}
                  title={allCover ? "Fit every image" : "Fill the frame with every image"}
                  aria-label={allCover ? "Fit image" : "Fill frame"}
                >
                  {allCover ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              )}
              {phytoSet.slides.length > 0 && (
                <button
                  type="button"
                  onClick={addMediaSection}
                  className={ICONBTN}
                  title="Add section"
                  aria-label="Add section"
                >
                  <SeparatorHorizontal className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
        <input
          ref={mediaFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,application/pdf,video/mp4,video/quicktime,video/webm"
          multiple
          disabled={converting || uploading}
          className="hidden"
          onChange={(e) => {
            handleMediaFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {videoErr && (
          <p className="mono mt-2 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
            {videoErr}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {phytoSet.slides.length === 0 ? (
          <label
            className={`mono flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 text-center text-xs uppercase leading-relaxed tracking-wider transition ${
              converting || uploading
                ? "cursor-wait border-foreground/30 text-muted-foreground"
                : fileOver
                  ? "border-foreground bg-foreground/5"
                  : "border-foreground/60 text-muted-foreground hover:border-foreground"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
              </>
            ) : converting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Converting…
              </>
            ) : fileOver ? (
              "Drop to upload"
            ) : (
              "Drop images, PDFs or videos here or click to browse"
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,application/pdf,video/mp4,video/quicktime,video/webm"
              multiple
              disabled={converting || uploading}
              className="hidden"
              onChange={(e) => handleMediaFiles(e.target.files)}
            />
          </label>
        ) : (
          <>
            {(fileOver || uploading) && (
              <p className="mono mb-3 text-center text-xs uppercase tracking-wider text-muted-foreground">
                {uploading ? "Uploading…" : "Drop to add media"}
              </p>
            )}
            <div className={`mb-3 justify-end gap-2 ${phone ? "hidden" : "flex"}`}>
              {/* Fit for EVERY image at once: fills the frame unless they all
                  already do, in which case it fits them instead. */}
              {hasImages &&
                (() => {
                  return (
                    <button
                      type="button"
                      onClick={fitAllImages}
                      className="mono uppercase pill flex items-center gap-2 border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
                      title={allCover ? "Fit every image" : "Fill the frame with every image"}
                    >
                      {allCover ? "Fit image" : "Fill frame"}
                    </button>
                  );
                })()}
              <button
                type="button"
                onClick={() => mediaFileRef.current?.click()}
                disabled={converting || uploading}
                className="mono uppercase pill flex items-center gap-2 border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background disabled:opacity-50"
              >
                Add image
              </button>
              <button
                type="button"
                onClick={addMediaSection}
                className="mono uppercase pill flex items-center gap-2 border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
              >
                Add section
              </button>
            </div>
            <SlideGrid
              slides={phytoSet.slides}
              selectedId={selected?.id ?? null}
              multiSel={multiSel}
              onSelect={handleSelect}
              onRemove={(id) => removeSlide(phytoSet.id, id)}
              onReorder={(ids, drop) => reorderSlides(phytoSet.id, ids, drop)}
              onToggleFit={(id) =>
                updateSet(phytoSet.id, {
                  slides: phytoSet.slides.map((sl) =>
                    sl.id === id
                      ? { ...sl, imageFit: sl.imageFit === "cover" ? "contain" : "cover" }
                      : sl,
                  ),
                })
              }
              onRenameDivider={(id, name) =>
                updateSet(phytoSet.id, {
                  slides: phytoSet.slides.map((sl) =>
                    sl.id === id ? { ...sl, sectionAfter: name } : sl,
                  ),
                })
              }
              onRemoveDivider={(id) =>
                updateSet(phytoSet.id, {
                  slides: phytoSet.slides.map((sl) =>
                    sl.id === id ? { ...sl, sectionAfter: undefined } : sl,
                  ),
                })
              }
              onRenameFirst={(name) =>
                updateSet(phytoSet.id, {
                  slides: phytoSet.slides.map((sl, i) =>
                    i === 0 ? { ...sl, sectionBefore: name } : sl,
                  ),
                })
              }
              dense={dense}
              single={!!phone}
              kind={phytoSet.kind}
            />
          </>
        )}
      </div>
    </div>
  );
  const mediaDialogs = (
    <>
      <AlertDialog open={showFileSizeDialog} onOpenChange={setShowFileSizeDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            File too large
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            One or more files exceeds the limit (5 MB for images and PDFs, 100 MB for videos).
            Please resize or compress your files and try again.
          </AlertDialogDescription>
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setShowFileSizeDialog(false)}
              className="mono uppercase w-full rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              OK
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showStorageLimitDialog} onOpenChange={setShowStorageLimitDialog}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Storage limit reached
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            Your account's media storage is full (you can see how much you're using in Settings). To
            make room for this upload, delete some of your previous videos, images, or slides, then
            try again.
          </AlertDialogDescription>
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setShowStorageLimitDialog(false)}
              className="mono uppercase w-full rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
            >
              OK
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
  const mediaPreview = selected ? (
    <>
      <div className="overflow-hidden rounded-lg bg-[var(--brand-black)]">
        <SlideView slide={selected} variant="preview" />
      </div>
      {selected.kind === "video" && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span className="mono uppercase tracking-wider text-muted-foreground">
            Autoplay when live
          </span>
          <PillSwitch
            label="Autoplay when live"
            checked={!!selected.autoplay}
            onCheckedChange={(on) => updateSlide(phytoSet.id, selected.id, { autoplay: on })}
          />
        </div>
      )}
    </>
  ) : (
    <p className="mono uppercase py-16 text-center text-xs tracking-wider text-muted-foreground">
      Slides will appear here as you add media
    </p>
  );
  if (phone) {
    return (
      <PhoneSetTabs
        set={phytoSet}
        header={<SetHeader {...headerProps} phone />}
        editor={
          <>
            {mediaLeft}
            {mediaDialogs}
          </>
        }
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <SetHeader {...headerProps} />

      <div className="flex min-h-0 flex-1 divide-x divide-foreground">
        {mediaLeft}

        {/* Right (1/2): the preview of the selected slide, or a placeholder while
            the set is still empty (matching the other editors). */}
        <div className="w-1/2 overflow-y-auto p-6">
          {phytoSet.slides.length > 0 && (
            <div className="mb-4">
              <MediaTemplateEditor setId={phytoSet.id} />
            </div>
          )}
          {mediaPreview}
        </div>
      </div>

      {mediaDialogs}
    </div>
  );
}

function PillInput({
  value,
  onChange,
  placeholder,
  onEnter,
  small = false,
}: {
  /** The phone's search size (text-xs, like every phone search bar). */
  small?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      className={`pill mono uppercase w-full border border-foreground bg-background px-4 outline-none focus:ring-1 focus:ring-foreground ${small ? "py-2 text-xs" : "py-1.5 text-sm"}`}
    />
  );
}

/** Section colours, in the presenter's order (see present.tsx TINTS). */
const SECTION_TINTS = ["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)"];

function kindColor(kind?: SetKind): string {
  if (kind === "song") return "var(--brand-blue)";
  if (kind === "scripture") return "var(--brand-green)";
  if (kind === "message") return "var(--brand-green-dark)";
  if (kind === "media") return "var(--brand-orange)";
  return "var(--foreground)";
}

function SlideGrid({
  slides,
  selectedId,
  multiSel,
  onSelect,
  onRemove,
  onReorder,
  onToggleFit,
  onRenameDivider,
  onRemoveDivider,
  onRenameFirst,
  dense,
  single = false,
  kind,
}: {
  /** One slide per row (the phone editor). */
  single?: boolean;
  slides: Slide[];
  selectedId: string | null;
  multiSel: Set<string>;
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onRemove: (id: string) => void;
  /** `drop`: the dragged slide and, when it was dropped right after a tile
   *  (its right half), that tile, so it joins the tile's section. */
  onReorder: (ids: string[], drop?: { movedId: string; joinAfterId?: string }) => void;
  /** Toggle an image slide's contain/cover fit (media only). */
  onToggleFit?: (id: string) => void;
  /** Rename the section divider that sits after slide `id` (media only). */
  onRenameDivider?: (id: string, name: string) => void;
  /** Remove the section divider that sits after slide `id` (media only). */
  onRemoveDivider?: (id: string) => void;
  /** Name the first section (kept on the first slide; media only). */
  onRenameFirst?: (name: string) => void;
  dense?: boolean;
  kind?: SetKind;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<Slide[] | null>(null);
  const liveOrderRef = useRef<Slide[] | null>(null);
  const dragIndex = useRef<number | null>(null);
  // The tile whose right half the slide was last dropped after, if any.
  const joinAfterRef = useRef<string | undefined>(undefined);

  const cols = single
    ? "grid-cols-1"
    : dense
      ? "grid-cols-3 md:grid-cols-4"
      : "grid-cols-2 md:grid-cols-4";
  const selColor = kindColor(kind);
  const displaySlides = liveOrder ?? slides;

  const commitOrder = () => {
    if (liveOrderRef.current && draggingId)
      onReorder(
        liveOrderRef.current.map((s) => s.id),
        { movedId: draggingId, joinAfterId: joinAfterRef.current },
      );
    liveOrderRef.current = null;
    joinAfterRef.current = undefined;
    setLiveOrder(null);
    setDraggingId(null);
    dragIndex.current = null;
  };

  const hasSections = displaySlides.some(
    (sl) => sl.sectionAfter !== undefined || sl.sectionBefore !== undefined,
  );

  // Preview the dragged slide dropped beside tile `s`: after it, or before.
  const previewAt = (s: Slide, afterTile: boolean) => {
    if (!draggingId) return;
    // Dropping onto a tile means joining its section: after it (right
    // half) or before it (left half). At a section boundary the two
    // halves land in the same slot but in different sections. The
    // preview is always derived from the SAVED order, never from the
    // previous preview, so no half-applied markers pile up.
    const moved = slides.find((x) => x.id === draggingId);
    if (!moved) return;
    const base = slides.filter((x) => x.id !== draggingId);
    const hoverIdx = base.findIndex((x) => x.id === s.id);
    if (hoverIdx === -1) return;
    const next = [...base];
    next.splice(afterTile ? hoverIdx + 1 : hoverIdx, 0, moved);
    const joinAfter = afterTile ? s.id : undefined;
    const prev = liveOrderRef.current;
    if (
      prev &&
      joinAfter === joinAfterRef.current &&
      prev.length === next.length &&
      prev.every((x, k) => x.id === next[k].id)
    )
      return;
    joinAfterRef.current = joinAfter;
    // Sections follow the slides around the drop point (see sections.ts).
    const kept = moveSlideKeepingSections(slides, next, draggingId, joinAfter);
    liveOrderRef.current = kept;
    setLiveOrder(kept);
  };
  // Phone: no HTML drag on touch, so each tile's number is a grip to drag by.
  const touchGrip = (s: Slide, i: number) =>
    touchReorder({
      attr: "media-tile",
      onStart: () => {
        setDraggingId(s.id);
        dragIndex.current = i;
      },
      onOver: (idx, row, y) => {
        const target = displaySlides[idx];
        // The dragged slide, not this grip's: callbacks refresh from any tile.
        if (!target || target.id === draggingId) return;
        const rect = row.getBoundingClientRect();
        previewAt(target, y > rect.top + rect.height / 2);
      },
      onEnd: commitOrder,
    });

  // One tile. Sections wrap the tiles below; the tile itself is the same.
  const renderTile = (s: Slide, i: number) => {
    const isSelected = selectedId === s.id;
    const inMulti = multiSel.has(s.id);
    const isDragging = s.id === draggingId;
    const borderStyle: React.CSSProperties | undefined = isSelected
      ? { borderColor: selColor }
      : inMulti
        ? { borderColor: `color-mix(in oklab, ${selColor} 60%, transparent)` }
        : undefined;
    return (
      <div
        key={s.id}
        data-media-tile={i}
        draggable
        onDragStart={(e) => {
          setDraggingId(s.id);
          dragIndex.current = i;
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (dragIndex.current === null || !draggingId) return;
          e.preventDefault();
          e.stopPropagation();
          // Hovering the dragged tile itself (where the preview put it) changes
          // nothing, which is what keeps the preview from flickering.
          if (s.id === draggingId) return;
          const rect = e.currentTarget.getBoundingClientRect();
          previewAt(s, e.clientX > rect.left + rect.width / 2);
        }}
        onDragEnd={commitOrder}
        onClick={(e) => onSelect(s.id, e)}
        style={borderStyle}
        className={`group relative cursor-grab overflow-hidden rounded-md border-2 transition ${
          isDragging ? "opacity-50" : ""
        } ${isSelected || inMulti ? "" : "border-transparent hover:border-muted-foreground"}`}
      >
        <SlideView slide={s} variant="thumb" />
        {single ? (
          <div
            {...touchGrip(s, i)}
            onClick={(e) => e.stopPropagation()}
            className="mono absolute left-1.5 top-1.5 flex touch-none items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1.5 text-[11px] text-white"
            aria-label="Drag to reorder"
          >
            <DotsGrip size={10} />
            {i + 1}
          </div>
        ) : (
          <div className="mono absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
            {i + 1}
          </div>
        )}
        {/* Hover controls; always shown on the phone (no hover there). */}
        <div
          className={`absolute right-1.5 top-1.5 flex transition ${
            single ? "gap-1.5" : "gap-0.5 opacity-0 group-hover:opacity-100"
          }`}
        >
          {s.kind === "image" && onToggleFit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFit(s.id);
              }}
              className={`rounded-full bg-black/60 text-white ${single ? "p-2" : "p-1"}`}
              aria-label={s.imageFit === "cover" ? "Fit image (contain)" : "Fill frame (cover)"}
              title={s.imageFit === "cover" ? "Fit image" : "Fill frame"}
            >
              {s.imageFit === "cover" ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(s.id);
            }}
            className={`rounded-full bg-black/60 text-white ${single ? "p-2" : "p-1"}`}
            aria-label="Remove slide"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  };

  const onDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.files?.length) return;
    e.stopPropagation();
    commitOrder();
  };

  if (!hasSections) {
    return (
      <div className={`grid gap-3 ${cols}`} onDrop={onDrop}>
        {displaySlides.map(renderTile)}
      </div>
    );
  }

  // Sections: each is a coloured area (the presenter's colours) with its name
  // at the top left and, for every section but the first, its delete at the
  // top right (removing the divider folds it into the section above). The
  // first section's name is kept on the first slide.
  const sections: { start: number; slides: Slide[] }[] = [];
  displaySlides.forEach((sl, i) => {
    if (i === 0 || displaySlides[i - 1].sectionAfter !== undefined) {
      sections.push({ start: i, slides: [] });
    }
    sections[sections.length - 1].slides.push(sl);
  });

  return (
    <div className="space-y-3" onDrop={onDrop}>
      {sections.map((sec, gi) => {
        const opener = gi === 0 ? null : displaySlides[sec.start - 1];
        const name =
          gi === 0 ? (displaySlides[0]?.sectionBefore ?? "") : (opener?.sectionAfter ?? "");
        return (
          <div
            // Keyed by position, not by the slide that opens the section: during
            // a drag the divider can hop between slides on every move, and an
            // id key would remount the whole section (and every tile in it)
            // each time it hopped, which read as flicker in the section below.
            key={gi}
            className="rounded-xl p-3"
            style={{
              backgroundColor: `color-mix(in oklab, ${SECTION_TINTS[gi % 3]} 45%, transparent)`,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <input
                value={name}
                onChange={(e) =>
                  gi === 0
                    ? onRenameFirst?.(e.target.value)
                    : onRenameDivider?.(opener!.id, e.target.value)
                }
                onClick={(e) => e.stopPropagation()}
                placeholder="Section name"
                className="mono w-48 bg-transparent text-[10px] uppercase tracking-wider outline-none placeholder:text-muted-foreground/60"
              />
              {gi > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveDivider?.(opener!.id);
                  }}
                  className="rounded-full p-1 text-foreground/60 transition hover:bg-foreground/15 hover:text-foreground"
                  aria-label="Remove section"
                  title="Remove section (its slides join the section above)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className={`grid gap-3 ${cols}`}>
              {sec.slides.map((sl, j) => renderTile(sl, sec.start + j))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Chord settings for a song. Chords are typed inline in the lyrics as `(G)`;
 * this panel records the key they were written in and picks how they render on
 * people's phones — as letters (optionally transposed) or Nashville numbers.
 * Nothing here rewrites the lyrics, so every choice is reversible.
 */
function ChordControls({
  setId,
  lyrics,
  onLyricsChange,
  onInsertChord,
  onClearLine,
  onTranspose,
  noPalette = false,
  children,
}: {
  setId: string;
  lyrics: string;
  /** Multilanguage: transposing rewrites the grid's chords instead of
   *  `lyrics` (which is then only read to tell whether there are chords). */
  onTranspose?: (from: string, to: string) => void;
  /** Multilanguage: chords are typed in the grid, so no palette. */
  noPalette?: boolean;
  /** Used to rewrite every chord in the lyrics when the key changes. */
  onLyricsChange: (next: string) => void;
  /** Drop a chord in at the caret, from the palette below. */
  onInsertChord: (chord: string) => void;
  /** Remove every chord from the line the caret is on. */
  onClearLine: () => void;
  /** Rendered to the left of the Chords switch, sharing its row. */
  children?: ReactNode;
}) {
  const updateSet = useLibrary((s) => s.updateSet);
  const chords = useLibrary((s) => s.sets[setId]?.chords);
  const shown = !!chords && !chords.hidden;
  const detected = hasChords(lyrics);

  // Transposing rewrites the chords in the lyrics themselves and carries `key`
  // along with them, so the Key box always states what is actually stored.
  // That is what lets numbers be derived without a separate "written in" key.
  const changeKey = (next: string) => {
    if (!chords || next === chords.key) return;
    if (onTranspose) onTranspose(chords.key, next);
    else onLyricsChange(transposeLyrics(lyrics, chords.key, next));
    updateSet(setId, { chords: { ...chords, key: next } });
  };

  // NB: turning chords on automatically is driven from handleLyricsChange, not
  // from an effect on `lyrics`. `lyrics` starts empty and is only then filled in
  // from the stored slides, so an effect would fire on mount and write to the
  // set just for opening the editor — the phantom-conflict bug fixed in 01dff4e.

  // The Chords switch sits beside Lines per slide (the caller's children).
  return (
    <div className="mt-3">
      {/* Column gap between groups, no margins: a wrapped group starts flush
          left under Lines per slide. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{children}</div>

      {shown && chords && (
        // Key and the palette share a row when there's room; otherwise the
        // palette drops to the next row as one group.
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-foreground/15 pt-3">
          <div className="flex shrink-0 items-center gap-2">
            {(["numbers", "letters"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => updateSet(setId, { chords: { ...chords, display: d } })}
                className={`pill mono h-7 border border-foreground px-3 text-xs uppercase transition ${
                  chords.display === d
                    ? "bg-foreground text-background"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {d}
              </button>
            ))}

            {chords.display === "letters" && (
              <>
                <span className="mono ml-1 shrink-0 text-[10px] uppercase tracking-wider">Key</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    {/* pr sits wider than pl so the chevron tucks in from the
                        pill's right edge rather than hugging it. */}
                    {/* No `uppercase` here: it's a CSS transform, and it would
                        render the lowercase b in Db/Eb/Ab/Bb as a capital B —
                        indistinguishable from the note B. KEYS is already
                        correctly cased. */}
                    <button className="pill mono flex h-7 items-center gap-1.5 border border-foreground bg-background pl-3 pr-2.5 text-xs tracking-wider transition hover:bg-muted">
                      {chords.key}
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-0">
                    {KEYS.map((k) => (
                      <DropdownMenuItem
                        key={k}
                        onClick={() => changeKey(k)}
                        className="mono text-xs tracking-wider focus:bg-[var(--brand-blue)] focus:text-[var(--brand-white)]"
                      >
                        {k}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {/* The seven chords of the key. Click to drop one in at the caret;
              mousedown is swallowed so the textarea keeps focus and the caret
              stays where the user left it. */}
          <div className={`flex shrink-0 items-center gap-1.5 ${noPalette ? "hidden" : ""}`}>
            {diatonicChords(chords.key).map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertChord(c)}
                title={`Insert ${c}`}
                className="mono flex h-9 w-9 items-center justify-center rounded-full border border-foreground text-[10px] tracking-tight transition hover:bg-foreground hover:text-background"
              >
                {renderChord(c, chords)}
              </button>
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClearLine}
              title="Clear chords on this line"
              aria-label="Clear chords on this line"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--brand-red)] text-[var(--brand-red)] transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!detected && (
            <p className="mono basis-full uppercase text-[10px] leading-relaxed text-muted-foreground">
              No chords in the lyrics yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const CHORD_SHEET_KEY = "phyto_chord_sheet_hidden";

/**
 * Mirrors what the phone view shows once someone turns chords on, so the leader
 * can check placement and the chosen key without leaving the editor. The slide
 * thumbnails below deliberately never show chords — the projector doesn't.
 */
function ChordSheet({ slides, chords }: { slides: Slide[]; chords: SongChords }) {
  // Hide folds the sheet down to its title bar; remembered on this device.
  const [hidden, setHidden] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(CHORD_SHEET_KEY) === "1",
  );
  const toggleHidden = () =>
    setHidden((h) => {
      localStorage.setItem(CHORD_SHEET_KEY, h ? "0" : "1");
      return !h;
    });
  const groups: { label: string | undefined; lines: string[] }[] = [];
  for (const s of slides) {
    const last = groups[groups.length - 1];
    if (!last || s.section !== last.label) {
      groups.push({ label: s.section, lines: [...(s.lines ?? [])] });
    } else {
      last.lines.push(...(s.lines ?? []));
    }
  }

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-foreground">
      {/* The whole title bar folds and unfolds the sheet. */}
      <button
        type="button"
        onClick={toggleHidden}
        aria-label={hidden ? "Show the chord sheet" : "Hide the chord sheet"}
        aria-expanded={!hidden}
        className={`mono flex w-full items-center justify-between gap-2 p-4 text-left text-[10px] uppercase tracking-wider outline-none transition focus-visible:bg-muted ${hidden ? "hover:bg-muted" : "pb-3"}`}
      >
        <span>Chord sheet</span>

        {/* The key letter itself is excluded from the uppercase transform: it
            would render the lowercase b in Db/Eb/Ab/Bb as a capital B. */}
        <span className="ml-auto text-muted-foreground">
          {chords.display === "numbers" ? (
            "Numbers"
          ) : (
            <>
              Key of <span className="normal-case">{chords.key}</span>
            </>
          )}
        </span>
        <ChevronDown
          className={`relative top-px h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${hidden ? "" : "rotate-180"}`}
        />
      </button>
      {/* Height animates through a grid row going 0fr to 1fr. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${hidden ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-72 space-y-3 overflow-y-auto px-4 pb-4 pr-5 text-sm">
            {groups.map((g, i) => (
              <div key={i}>
                {g.label && (
                  <div className="mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </div>
                )}
                <div className="space-y-1.5">
                  {g.lines.map((line, j) => (
                    <ChordLine
                      key={j}
                      line={line}
                      chords={chords}
                      show
                      className="leading-relaxed"
                      chordClassName="mono text-[0.8em]"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const SEARCH_PLACEHOLDERS = ["Search to import a new song", "e.g. How Great is Our God"];

/** The search-result hover preview — chords never show anywhere but the
 *  editor, and a bracket-laden chorus is harder to skim than a plain one. */
function chordFreePreview(lyrics: string): string {
  return songPreview(lyrics.split("\n").map(stripChords).join("\n"));
}

function Importers({
  setId,
  kind,
  phone = false,
}: {
  setId: string;
  kind: SetKind;
  /** The phone layout: Multi-Language shows two languages at a time, picked
   *  from a chip bar above the grid. */
  phone?: boolean;
}) {
  // Phone: the importer folds away (song search, scripture lookup).
  const [importOpen, setImportOpen] = useState(true);
  const { addSlide, updateSet } = useLibrary();
  const songLangCols = useLibrary((s) => s.sets[setId]?.langs);
  const [pickedLangs, setPickedLangs] = useState<LangCode[]>([]);
  const langPair = useMemo(
    () => phoneLangPair(songLangCols ?? [], pickedLangs),
    [songLangCols, pickedLangs],
  );
  const navigate = useNavigate();

  const [linesPer, setLinesPer] = useState<number>(() => {
    const stored = localStorage.getItem("phyto_lines_per_slide");
    return stored ? Math.max(1, Number(stored) || 2) : 2;
  });
  // Seed the textarea from the stored slides in the SAME render the component
  // mounts, so the live-sync effect's first run sees text that round-trips to
  // identical content and writes nothing. (The old mount-effect reconstruction
  // left the first sync pass running against "" — transiently writing
  // slides: [] — then rebuilt every slide with fresh ids, which changed the
  // sync fingerprint and flagged a phantom conflict on other devices.)
  const [lyrics, setLyrics] = useState(() => {
    if (kind !== "song") return "";
    return slidesToLyricsText(useLibrary.getState().sets[setId]?.slides ?? []);
  });
  // Call and Response: one role per line of `lyrics` (the box holds only the
  // words). Kept in every mode, so switching back brings the roles back.
  // Call and Response styles (Show role, Align), baked onto the slides.
  const showRoles = useLibrary((s) => !!s.sets[setId]?.showRoles);
  const roleAlign = useLibrary((s) => s.sets[setId]?.roleAlign);
  const [roles, setRoles] = useState<LineRoles>(() => {
    if (kind !== "song") return [];
    const slides = useLibrary.getState().sets[setId]?.slides ?? [];
    return rolesFromSlides(slidesToLyricsText(slides), slides);
  });
  const prevLinesPer = useRef(linesPer);
  /** Text the box is about to get from a mode switch (see the live-sync effect). */
  const awaitLyrics = useRef<string | null>(null);
  /** Shared by the stepper buttons and typing directly into the box. */
  const requestLinesPerChange = (raw: number) => {
    const next = Math.min(8, Math.max(1, raw || 1));
    if (next === linesPer && !customBreaks) return;
    // Only hand-placed breaks (C) are worth a question; an even division
    // re-divides at once.
    if (customBreaks && lyrics.trim()) {
      setPendingLinesPerConfirm(next);
      return;
    }
    prevLinesPer.current = next;
    setLinesPer(next);
    if (customBreaks) updateSet(setId, { customBreaks: undefined });
    if (lyrics.trim()) {
      const divided = applyDividers(lyrics, next);
      setRoles((r) => remapRoles(lyrics, divided, r));
      setLyrics(divided);
    }
  };

  const [songQuery, setSongQuery] = useState("");
  // The search box has no single natural placeholder — cycle between what it's
  // for and an example, crossfading rather than snapping so both are readable.
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setPlaceholderIdx((i) => (i + 1) % SEARCH_PLACEHOLDERS.length),
      3000,
    );
    return () => clearInterval(t);
  }, []);
  const [songResults, setSongResults] = useState<SongResult[]>([]);
  const [songSearching, setSongSearching] = useState(false);
  const [songErr, setSongErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ text: string; x: number; y: number } | null>(null);
  const searchSeq = useRef(0);
  // Results/error stay in state across a blur so refocusing the input shows
  // the same search again without a re-fetch — only their VISIBILITY toggles.
  const [resultsOpen, setResultsOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!resultsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setResultsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [resultsOpen]);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  // Undo/redo for the lyrics box. The browser's own undo can't be used here:
  // the box is controlled and often shows a transformed view (numbers, or
  // chords hidden), so its value doesn't track the native edit history. Each
  // entry carries the chord config too, so undoing a transpose puts the key
  // back with the text rather than leaving the two disagreeing.
  const undoStack = useRef<
    { lyrics: string; roles: LineRoles; chords?: SongChords; caret: number | null }[]
  >([]);
  const redoStack = useRef<typeof undoStack.current>([]);
  const lastPush = useRef(0);
  // `lyrics` is always stored as letter chords. The box may show something else
  // — nothing at all when chords are switched off, or Nashville numbers when
  // that's the chosen display — and every edit is translated back on the way in,
  // so nothing is lost either way.
  const chordCfg = useLibrary((s) => s.sets[setId]?.chords);
  // True whenever chords aren't actively being shown — either explicitly
  // hidden, or never configured at all (a fresh song, or one where the last
  // search-select left the toggle off). Both must hide the box the same way:
  // `!!chordCfg?.hidden` alone treated "never configured" as "not hidden", so
  // the box rendered chord rows for a song whose switch plainly reads off.
  const chordsHidden = !chordCfg || chordCfg.hidden === true;
  const numbersMode = !!chordCfg && !chordCfg.hidden && chordCfg.display === "numbers";
  const chordKey = chordCfg?.key ?? "C";
  // Chords show as a row above the words they sit over, the way every chord
  // sheet is written — inline brackets are hard to read mid-lyric. The row
  // carries numbers instead of letters when that's the chosen display.
  const chordLabel = numbersMode ? (c: string) => chordToNumber(c, chordKey) : (c: string) => c;
  // The inverse of chordLabel: what a re-derived row token converts back to
  // before it's spliced into storage, which always holds letter chords. Without
  // this a numbered row that misses the exact-match cache would splice the bare
  // number in as "(4)" — not a valid chord, so it leaks into the lyric as text.
  const chordRead = numbersMode
    ? (t: string) => (isNumberToken(t) ? numberToChord(t, chordKey) : t)
    : (t: string) => t;
  const boxText = chordsHidden ? hideChords(lyrics) : inlineToChordRows(lyrics, chordLabel);
  // Last caret position in the lyrics box. Null until it has been focused, so
  // a palette click before that appends rather than landing at position 0.
  const caretRef = useRef<number | null>(null);

  const [pendingLinesPerConfirm, setPendingLinesPerConfirm] = useState<number | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [modeQuestion, setModeQuestion] = useState<ModeQuestion | null>(null);
  const songLayout = useLibrary((s) => {
    const set = s.sets[setId];
    return set ? songLayoutOf(set) : "standard";
  });
  // Slide breaks placed by hand (Lines per slide shows C).
  const customBreaks = useLibrary((s) => !!s.sets[setId]?.customBreaks);
  const markCustomBreaks = () => {
    if (!useLibrary.getState().sets[setId]?.customBreaks) updateSet(setId, { customBreaks: true });
  };
  // The Lines per slide row: the grid editors put their toolbars here.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  const [langAddSlot, setLangAddSlot] = useState<HTMLDivElement | null>(null);
  const multiPer = useLibrary((s) => {
    const set = s.sets[setId];
    return set ? langLinesPer(set) : 1;
  });
  // Multilanguage: the first column's words, to tell whether there are chords.
  const multiChordText = useLibrary((s) => {
    const set = s.sets[setId];
    const first = set?.langs?.[0];
    if (!set || set.songLayout !== "multilang" || !first) return "";
    return set.slides.map((sl) => sl.linesByLang?.[first] ?? "").join("\n");
  });
  // Remounts the Multilanguage grid when its rows are replaced from outside it
  // (a search result picked while it's open).
  const [gridKey, setGridKey] = useState(0);

  /**
   * Song Settings: change the song's layout without losing any words.
   * Into Multilanguage, the existing words become the first column (`lang`,
   * asked for when there are any), one line per slide. Out of it, each slide
   * keeps every language stacked as plain lines. Standard and Call and
   * Response share the plain editor, so switching between them changes nothing
   * but the role gutter.
   */
  const switchLayout = (next: SongLayout, lang?: LangCode) => {
    const set = useLibrary.getState().sets[setId];
    if (!set) return;
    const from = songLayoutOf(set);
    if (next === from) return;
    if (next === "multilang") {
      // Back from hidden: the kept grid, its kept column refilled from the
      // plain words. Otherwise the plain words become the `lang` column.
      const hidden = set.hiddenLangs;
      const first = hidden ? hidden.kept : lang;
      const rows = hidden
        ? returnToMultilang(hidden, set.slides)
        : first
          ? standardToRows(set.slides, first)
          : [];
      const langs = hidden ? hidden.langs : first ? [first] : [];
      const per = hidden?.langLinesPer;
      // Roles have no place in the grid: kept by lyric line until it's left.
      const lineRoles = lyricLineRoles(lyrics, roles);
      updateSet(setId, {
        songLayout: "multilang",
        langs,
        langsShown: hidden?.langsShown,
        langLinesPer: per,
        hiddenLangs: undefined,
        lineRoles: lineRoles.some(Boolean) ? lineRoles : undefined,
        // Custom breaks carry over as they are; otherwise the grid divides
        // the song by its own Lines per slide.
        slides: rowsToSlides(
          set.customBreaks ? rows : divideRows(rows, langLinesPer({ langLinesPer: per })),
          shownLangs(langs, hidden?.langsShown),
        ),
      });
      setGridKey((k) => k + 1);
      return;
    }
    if (from === "multilang") {
      // Keep one language in the plain editor; the grid stays hidden on the set.
      const kept = langToKeep(set, lang);
      if (kept) {
        const { text, hidden } = leaveMultilang(set, kept);
        const divided = set.customBreaks ? text : applyDividers(text, linesPer);
        const nextRoles = rolesForLyricLines(divided, set.lineRoles ?? []);
        // The final slides go in with the new mode, so no frame shows the
        // grid's slides (or slides from the box's old text) under it.
        const parsed = plainSongSlides(divided, nextRoles, next === "response", {
          marks: showRoles,
          align: roleAlign,
        });
        awaitLyrics.current = divided;
        updateSet(setId, {
          songLayout: next === "standard" ? undefined : next,
          langs: undefined,
          langsShown: undefined,
          langLinesPer: undefined,
          hiddenLangs: hidden,
          lineRoles: undefined,
          slides: reconcileSlideIds(parsed, set.slides).slides,
        });
        setRoles(nextRoles);
        setLyrics(divided);
      } else {
        awaitLyrics.current = "";
        updateSet(setId, { songLayout: next === "standard" ? undefined : next, slides: [] });
        setRoles([]);
        setLyrics("");
      }
      return;
    }
    updateSet(setId, { songLayout: next === "standard" ? undefined : next });
  };

  // Beside Lines per slide: Chords, and in Call and Response its two styles.
  // A label never wraps away from its control.
  const toggle = (label: string, checked: boolean, onChange: (on: boolean) => void) => (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span className="mono whitespace-nowrap text-[10px] uppercase tracking-wider">{label}</span>
      <PillSwitch label={label} checked={checked} onCheckedChange={onChange} />
    </span>
  );
  const songToggles = (
    <>
      {toggle(phone ? "C" : "Chords", !chordsHidden, (on) =>
        updateSet(setId, {
          chords: {
            ...(chordCfg ?? { key: guessKey(lyrics) ?? "G", display: "letters" as const }),
            hidden: !on,
          },
        }),
      )}
      {/* Phone: the song's mode, as its pattern, after C. */}
      {phone && <SongModePicker setId={setId} compact />}
      {songLayout === "response" && (
        // Phone: Role and Align together on their own row.
        <span className={phone ? "flex w-full items-center gap-4" : "contents"}>
          {toggle(phone ? "Role" : "Show role", showRoles, (on) =>
            updateSet(setId, { showRoles: on || undefined }),
          )}
          <span className="inline-flex shrink-0 items-center gap-2">
            <span className="mono whitespace-nowrap text-[10px] uppercase tracking-wider">
              Align
            </span>
            {/* Phone: L / M / R. */}
            <div className="pill flex h-7 items-center border border-foreground p-0.5">
              {(
                [
                  ["left", phone ? "L" : "Left"],
                  [undefined, phone ? "M" : "Middle"],
                  ["split", phone ? "R" : "Right"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => updateSet(setId, { roleAlign: value })}
                  aria-pressed={roleAlign === value}
                  className={`pill mono h-full px-2.5 text-[10px] uppercase tracking-wider transition ${
                    roleAlign === value ? "bg-foreground text-background" : "hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </span>
        </span>
      )}
    </>
  );

  /** The header's Mode dropdown: ask the mode's question first, if it has one. */
  const chooseMode = (next: SongLayout) => {
    const set = useLibrary.getState().sets[setId];
    if (!set) return;
    const from = songLayoutOf(set);
    if (next === from) return;
    if (next === "multilang" && !set.hiddenLangs && lyrics.trim()) {
      setModeQuestion({ kind: "current" });
    } else if (from === "multilang" && (set.langs?.length ?? 0) > 1) {
      setModeQuestion({ kind: "keep", next, langs: set.langs ?? [] });
    } else {
      switchLayout(next, from === "multilang" ? set.langs?.[0] : undefined);
    }
  };
  const postGridChord = useGridChordBus((s) => s.post);
  const modeRequest = useSongModeRequest((s) => s.request);
  const clearModeRequest = useSongModeRequest((s) => s.clear);
  useEffect(() => {
    if (!modeRequest || modeRequest.setId !== setId) return;
    clearModeRequest();
    chooseMode(modeRequest.mode);
    // chooseMode reads the latest store state itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeRequest, setId]);

  const [ref, setRef] = useState("");
  const [version2Open, setVersion2Open] = useState(false);
  const [settingsOpenHere, setSettingsOpenHere] = useState(false);
  // Phone: the header's cog opens it.
  const busSettingsOpen = usePhoneEditorBus((s) => s.scriptureSettings);
  const setBusSettingsOpen = usePhoneEditorBus((s) => s.setScriptureSettings);
  const settingsOpen = phone ? busSettingsOpen : settingsOpenHere;
  const setSettingsOpen = phone ? setBusSettingsOpen : setSettingsOpenHere;
  const [showUpdateVersions, setShowUpdateVersions] = useState(false);
  // Who else sees the set, named in the re-import dialog (a re-import changes
  // it for everyone it's shared with). Fetched when the dialog opens.
  const audienceSet = useLibrary((s) => s.sets[setId]);
  const audienceWorkspace = useLibrary((s) => s.activeWorkspace);
  const updateAudience = useSetAudience(
    showUpdateVersions ? audienceSet : null,
    undefined,
    audienceWorkspace === "personal" ? null : audienceWorkspace,
  );
  // The versions the Update dialog will re-import in, seeded from the
  // workspace's when it opens and adjustable there.
  const [updateV1, setUpdateV1] = useState("");
  const [updateV2, setUpdateV2] = useState("");
  const [updateV1Open, setUpdateV1Open] = useState(false);
  const [updateV2Open, setUpdateV2Open] = useState(false);
  // Re-import replaces this set's passages; Duplicate makes a copy in the
  // chosen versions and leaves this set as it is.
  const [updateMode, setUpdateMode] = useState<"reimport" | "duplicate">("reimport");
  const openUpdateVersions = (mode: "reimport" | "duplicate") => {
    setUpdateMode(mode);
    setUpdateV1(scripture.workspaceVersions.v1);
    setUpdateV2(scripture.workspaceVersions.v2);
    setShowUpdateVersions(true);
  };
  // Scripture: boxes, imports, versions (see the hook).
  const scripture = useScriptureVersions({ setId, kind });
  const {
    translation,
    setTranslation,
    translation2,
    setTranslation2,
    versesPer,
    setVersesPer,
    keepLineBreaks,
    setKeepLineBreaks,
    busy,
    err,
    alignNote,
    manualText,
    setManualText,
    manualText2,
    setManualText2,
  } = scripture;

  // Late hydration (song): on a direct URL load Dexie may not have populated
  // the store yet, so the lazy initializer above saw no slides. Reconstruct
  // once they appear, but never clobber text the user already typed.
  const hydrated = useRef(lyrics !== "");
  const storeSlides = useLibrary((s) => s.sets[setId]?.slides);
  useEffect(() => {
    if (hydrated.current || kind !== "song") return;
    if (!storeSlides || storeSlides.length === 0) return;
    hydrated.current = true;
    if (lyrics === "") {
      const text = slidesToLyricsText(storeSlides);
      setLyrics(text);
      setRoles(rolesFromSlides(text, storeSlides));
    }
  }, [storeSlides, kind, lyrics]);

  // Persist linesPer across navigations.
  useEffect(() => {
    localStorage.setItem("phyto_lines_per_slide", String(linesPer));
  }, [linesPer]);

  // Warm the local song database so the first search paints instantly.
  useEffect(() => {
    if (kind === "song") preloadSongs();
  }, [kind]);

  // Live sync: rebuild slides whenever the lyrics change (song only).
  // Reconciled against the stored slides so an unchanged round-trip keeps
  // every slide id and skips the write entirely — otherwise merely opening
  // this editor would bump updatedAt and push regenerated ids, which reads as
  // a real content conflict (`modified`, not `touched`) on other devices.
  useEffect(() => {
    if (kind !== "song") return;
    // A Multilanguage song is written by its grid, never from this box.
    if (songLayout === "multilang") return;
    // Just out of Multi-Language: the store can show the new mode a render
    // before the box gets its text. Wait for it, or the old text is written.
    if (awaitLyrics.current !== null) {
      if (lyrics !== awaitLyrics.current) return;
      awaitLyrics.current = null;
    }
    // Roles go on as `roles` in Call and Response, kept as `hiddenRoles` else.
    const parsed = plainSongSlides(lyrics, roles, songLayout === "response", {
      marks: showRoles,
      align: roleAlign,
    });
    const current = useLibrary.getState().sets[setId]?.slides ?? [];
    const { slides, changed } = reconcileSlideIds(parsed, current);
    if (changed) updateSet(setId, { slides });
  }, [lyrics, roles, kind, setId, updateSet, songLayout, showRoles, roleAlign]);

  const runSongSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!songQuery.trim()) return;
    const seq = ++searchSeq.current; // ignore results from superseded searches
    setSongSearching(true);
    setSongErr(null);
    setResultsOpen(true);
    try {
      // Paint instant local matches, then slot online results in as they load.
      const { local, online } = await searchSongs(songQuery);
      if (searchSeq.current === seq) setSongResults(local);
      const final = await online;
      if (searchSeq.current === seq) {
        setSongResults(final);
        if (final.length === 0)
          setSongErr("Couldn't find that song. Paste the lyrics below to add it manually.");
      }
    } catch (e) {
      if (searchSeq.current === seq) setSongErr((e as Error).message);
    } finally {
      if (searchSeq.current === seq) setSongSearching(false);
    }
  };

  // When lyrics are pasted into an empty box after a search, name the still-
  // default set from what was typed (e.g. "Inhabit by Bethel" -> "Inhabit").
  // Don't override a name the user set or one taken from a selected result.
  const snapshot = () => ({
    lyrics,
    roles,
    chords: useLibrary.getState().sets[setId]?.chords,
    caret: caretRef.current,
  });

  /** Remember the current state before changing it, coalescing a burst of
   *  typing into a single undo step. */
  const pushHistory = () => {
    const now = Date.now();
    if (now - lastPush.current < 500 && undoStack.current.length > 0) return;
    lastPush.current = now;
    undoStack.current.push(snapshot());
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
  };

  const restore = (entry: {
    lyrics: string;
    roles: LineRoles;
    chords?: SongChords;
    caret: number | null;
  }) => {
    setLyrics(entry.lyrics);
    setRoles(entry.roles);
    const now = useLibrary.getState().sets[setId]?.chords;
    if (JSON.stringify(now) !== JSON.stringify(entry.chords)) {
      updateSet(setId, { chords: entry.chords });
    }
    lastPush.current = 0; // the next edit starts a fresh step
    if (entry.caret !== null) {
      caretRef.current = entry.caret;
      requestAnimationFrame(() => lyricsRef.current?.setSelectionRange(entry.caret!, entry.caret!));
    }
  };

  const undoLyrics = () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(snapshot());
    restore(entry);
  };

  const redoLyrics = () => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(snapshot());
    restore(entry);
  };
  // Phone: the header's Undo button (the box and Call and Response; the
  // Multi-Language grid registers its own).
  useRegisterPhoneUndo(undoLyrics, !!phone && kind === "song" && songLayout !== "multilang");

  /** Translate what the box now contains back into stored form. Returns the
   *  new stored lyrics, so a caller that needs to know where something ended
   *  up post-edit (the caret, chiefly) doesn't have to wait for the render
   *  this triggers. */
  const commitFromBox = (val: string) => {
    const next = chordsHidden
      ? reapplyChords(lyrics, val)
      : readChordRows(val, lyrics, {
          snap: false,
          numbers: numbersMode,
          render: chordLabel,
          read: chordRead,
        });
    handleLyricsChange(next);
    return next;
  };

  const handleLyricsChange = (val: string) => {
    pushHistory();
    const wasEmpty = !lyrics.trim();
    const hadChords = hasChords(lyrics);
    setRoles((r) => remapRoles(lyrics, val, r));
    setLyrics(val);
    // Turn chords on the first time the leader actually types or pastes some.
    // Driven from here rather than an effect so opening the editor never writes.
    // A deliberate switch-off sticks: the text still has chords, so `hadChords`
    // is already true and this can't fire again.
    if (!hadChords && hasChords(val) && !useLibrary.getState().sets[setId]?.chords) {
      updateSet(setId, { chords: { key: guessKey(val) ?? "G", display: "letters" } });
    }
    if (wasEmpty && val.trim() && songQuery.trim()) {
      const current = useLibrary.getState().sets[setId];
      if (current && (current.name.trim() === "New Song" || !current.name.trim())) {
        const titled = parseQuery(songQuery).title.replace(/\b\w/g, (c) => c.toUpperCase());
        if (titled) updateSet(setId, { name: titled });
      }
    }
  };

  /**
   * Paste a chord sheet in any of the layouts these sites produce — Ultimate
   * Guitar's column-aligned chord rows, or WorshipTogether's one-chord-per-line
   * stream. Folded into the inline bracket format on the way in so the rest of
   * the app only ever deals with one representation. Anything that isn't
   * chord-shaped falls through to the browser's own paste.
   */
  const handleLyricsPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    const normalised = normaliseChordSheet(pasted);
    if (normalised === pasted) return; // nothing chord-shaped — let the browser paste
    // Divided the same way a search-imported song is: --- every linesPer real
    // lyric lines, so a pasted chord sheet lands pre-split into slides instead
    // of arriving as one continuous, undivided block.
    const folded = applyDividers(normalised, linesPer);
    const { selectionStart, selectionEnd } = e.currentTarget;
    e.preventDefault();
    // Splice in the box's own coordinates, then let commitFromBox translate the
    // result back. `folded` carries letter chords, which survive that in any mode.
    if (chordsHidden) {
      // They would land straight out of sight otherwise. `current` may be
      // undefined — a song that's never had chords configured is also
      // "hidden" by the check above — so this has to build a fresh config
      // rather than assume one to flip `hidden` off on.
      const current = useLibrary.getState().sets[setId]?.chords;
      let fresh: SongChords;
      if (looksLikeNumberChordStream(pasted)) {
        // A number stream carries no key of its own — normaliseChordSheet
        // stored it relative to C — so showing it as letters would put up an
        // arbitrary, probably wrong, set of chords. Numbers round-trip back
        // to exactly what was pasted instead. If the leader later switches
        // to letters themselves, C is what they'll see, matching this key.
        fresh = { key: "C", display: "numbers" };
      } else {
        // A ChordPro file that states its own key is trusted over a guess
        // from the chords it happens to use — it's what the chart was
        // actually written in, not a frequency count's best approximation.
        fresh = { key: chordProKey(pasted) ?? guessKey(folded) ?? "G", display: "letters" };
      }
      updateSet(setId, { chords: current ? { ...current, hidden: false } : fresh });
    }
    const asShown = chordsHidden ? folded : inlineToChordRows(folded, chordLabel);
    commitFromBox(boxText.slice(0, selectionStart) + asShown + boxText.slice(selectionEnd));
  };

  /**
   * Drop a chord in at the caret, from the palette of the key's seven chords.
   *
   * This writes to the STORED lyrics directly rather than splicing text into
   * the box: the caret can land in the middle of a lyric word — a completely
   * normal place to click before choosing a chord — and splicing raw text
   * there would type the label straight into the word instead of placing a
   * chord over it. insertChordAtBoxOffset maps the caret back to the right
   * word first. The palette only renders once chords are shown, so this never
   * runs while they're hidden.
   */
  const insertChord = (chord: string) => {
    const at = caretRef.current ?? boxText.length;
    const { lyrics: next, caret } = insertChordAtBoxOffset(lyrics, at, chord, chordLabel);
    handleLyricsChange(next);
    caretRef.current = caret;
    requestAnimationFrame(() => {
      lyricsRef.current?.focus();
      lyricsRef.current?.setSelectionRange(caret, caret);
    });
  };

  /** Remove every chord from the line the caret is on — the palette's clear button. */
  const clearLineChords = () => {
    const at = caretRef.current ?? boxText.length;
    const { lyrics: next, caret } = clearChordsAtBoxOffset(lyrics, at, chordLabel);
    handleLyricsChange(next);
    caretRef.current = caret;
    requestAnimationFrame(() => {
      lyricsRef.current?.focus();
      lyricsRef.current?.setSelectionRange(caret, caret);
    });
  };

  const importScripture = () => scripture.importScripture(ref);

  const importImages = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => isUploadableImage(f.type));
    if (list.length === 0) return;
    // Sequential: each image is uploaded to R2 before its slide is added, and a
    // burst of parallel uploads gains little on files this small.
    for (const file of list) {
      const img = await prepareImageFile(file);
      if (img) addSlide(setId, { kind: "image", imageUrl: img.url, lines: [] });
    }
  };

  if (kind === "song") {
    return (
      <div
        className={`flex h-full flex-col gap-0 overflow-hidden ${phone ? "has-dock relative" : ""}`}
      >
        {/* Search bar */}
        <div ref={searchBoxRef} className="shrink-0 border-b border-foreground/20 p-4">
          <PhoneFold
            enabled={!!phone}
            title="Song settings"
            open={importOpen}
            onToggle={() => setImportOpen((o) => !o)}
          >
            <form onSubmit={runSongSearch} className="flex gap-2">
              <div className="pill relative flex flex-1 items-center gap-2 border border-foreground bg-background px-4 py-2">
                <input
                  value={songQuery}
                  onChange={(e) => setSongQuery(e.target.value)}
                  onFocus={() => {
                    // Refocusing shows the same results again without re-searching.
                    if (songResults.length > 0 || songErr) setResultsOpen(true);
                  }}
                  aria-label="Search for a song"
                  className={`mono uppercase w-full bg-transparent outline-none ${phone ? "text-xs" : "text-sm"}`}
                />
                {/* A single native placeholder can't crossfade between two strings,
                  so it's faked: two stacked labels trading opacity, hidden the
                  moment there's real input. pointer-events-none keeps clicks
                  landing on the input underneath. */}
                {!songQuery && (
                  <div className="pointer-events-none absolute inset-y-0 left-4 right-4 flex items-center overflow-hidden">
                    {SEARCH_PLACEHOLDERS.map((text, i) => (
                      <span
                        key={text}
                        className={`mono uppercase absolute truncate text-muted-foreground transition-opacity duration-700 ${phone ? "text-xs" : "text-sm"} ${
                          i === placeholderIdx ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        {text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={songSearching || !songQuery.trim()}
                className="pill flex h-10 w-10 items-center justify-center bg-foreground text-background transition hover:opacity-90 disabled:opacity-50"
                aria-label="Search"
              >
                {songSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </form>
            <SongModeDialog
              question={modeQuestion}
              onCancel={() => setModeQuestion(null)}
              onAnswer={(next, lang) => {
                setModeQuestion(null);
                switchLayout(next, lang);
              }}
            />
            {songErr && resultsOpen && (
              <p className="mono mt-2 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
                {songErr}
              </p>
            )}
            {songResults.length > 0 && resultsOpen && (
              <div className="mt-2 max-h-56 space-y-1 overflow-auto rounded-2xl border border-foreground bg-background p-1">
                {songResults.map((s, idx) => {
                  // Thin blue line at the boundary between local DB results and
                  // online results (only when there are local results above).
                  const showDivider =
                    s.source === "online" && songResults[idx - 1]?.source === "local";
                  return (
                    <Fragment key={`${s.title}-${s.artist}-${idx}`}>
                      {showDivider && <div className="mx-2 my-1 h-px bg-[var(--brand-blue)]" />}
                      <button
                        onClick={() => {
                          // Bumping the sequence retires the online half of the
                          // search that is still in flight. Without it, results
                          // arriving after the click paint back over the song
                          // the user already picked.
                          searchSeq.current++;
                          setSongSearching(false);
                          setSongErr(null);
                          const imported = applyDividers(s.lyrics, linesPer);
                          const open = useLibrary.getState().sets[setId];
                          if (open?.customBreaks) updateSet(setId, { customBreaks: undefined });
                          if (open && songLayoutOf(open) === "multilang") {
                            // Into the grid's first column, one line per slide.
                            // English if the song has an English column.
                            const first = open.langs?.includes("en")
                              ? "en"
                              : (open.langs?.[0] ?? "en");
                            // The other columns keep their words, line by line.
                            const langs = open.langs?.length ? open.langs : [first];
                            updateSet(setId, {
                              langs,
                              slides: rowsToSlides(
                                returnToMultilang(
                                  { kept: first, langs, rows: slidesToRows(open.slides) },
                                  lyricsToSlides(imported),
                                ),
                                shownLangs(langs, open.langsShown),
                              ),
                            });
                            setGridKey((k) => k + 1);
                          }
                          setRoles([]);
                          setLyrics(imported);
                          setSongResults([]);
                          setPreview(null);
                          // The toggle's own state is preserved exactly — picking
                          // a search result isn't the same as pasting a chord
                          // sheet, so it never switches chords on by itself.
                          //
                          // The KEY is recorded either way, though. The library
                          // ships the key the song was actually published in for
                          // all but a handful of its chorded songs, and that tag
                          // is the real answer: throwing it away because the
                          // toggle happened to be off meant turning chords on
                          // later had nothing left to go on and fell back to
                          // guessing from the chords. On a song that doesn't open
                          // on its tonic that guess is simply wrong — 10,000
                          // Reasons opens "Bless the (C)Lord" but is published in
                          // G, so it came out a fourth off.
                          const currentChords = useLibrary.getState().sets[setId]?.chords;
                          const chordsCurrentlyOn = !!currentChords && !currentChords.hidden;
                          const importedKey =
                            (s.key ? normaliseKeyTag(s.key) : null) ?? guessKey(imported);
                          updateSet(setId, {
                            name: s.title,
                            ...(hasChords(imported) && importedKey
                              ? {
                                  chords: {
                                    key: importedKey,
                                    display: currentChords?.display ?? "letters",
                                    hidden: !chordsCurrentlyOn,
                                  },
                                }
                              : {}),
                          });
                        }}
                        onMouseEnter={(e) =>
                          setPreview({
                            text: chordFreePreview(s.lyrics),
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setPreview((p) =>
                            p
                              ? { ...p, x: e.clientX, y: e.clientY }
                              : { text: chordFreePreview(s.lyrics), x: e.clientX, y: e.clientY },
                          )
                        }
                        onMouseLeave={() => setPreview(null)}
                        className="group flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm transition hover:bg-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold">{s.title}</div>
                          <div className="mono uppercase truncate text-xs text-muted-foreground">
                            {s.artist}
                            {s.album ? ` · ${s.album}` : ""}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 opacity-40 group-hover:opacity-100" />
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            )}

            {/* Lines per slide, with the chord key and palette below while chords
              are on. A Multilanguage song is one line per slide, typed in its
              grid, so it has neither. */}
            {songLayout !== "multilang" ? (
              <ChordControls
                setId={setId}
                lyrics={lyrics}
                onLyricsChange={(next) => {
                  pushHistory();
                  setLyrics(next);
                }}
                onInsertChord={
                  songLayout === "response"
                    ? (chord) => postGridChord({ kind: "insert", chord })
                    : insertChord
                }
                onClearLine={
                  songLayout === "response"
                    ? () => postGridChord({ kind: "clear" })
                    : clearLineChords
                }
              >
                <span className="inline-flex shrink-0 items-center gap-2">
                  <span className="mono whitespace-nowrap text-[10px] uppercase tracking-wider">
                    {phone ? "L/S" : "Lines per slide"}
                  </span>
                  <NumberStepper
                    value={linesPer}
                    onChange={requestLinesPerChange}
                    format={(n) => (customBreaks ? "C" : String(n))}
                    min={1}
                    max={8}
                    decrementLabel="Fewer lines per slide"
                    incrementLabel="More lines per slide"
                  />
                </span>
                {songToggles}
                {songLayout === "response" && !phone && (
                  <div ref={setToolbarSlot} className="contents" />
                )}
              </ChordControls>
            ) : (
              // Multilanguage: lines of each language per slide (1 or 2), and the
              // chord key, with chords typed in the grid's first column.
              <ChordControls
                setId={setId}
                lyrics={multiChordText}
                onLyricsChange={() => {}}
                onInsertChord={(chord) => postGridChord({ kind: "insert", chord })}
                onClearLine={() => postGridChord({ kind: "clear" })}
                onTranspose={(fromKey, toKey) => {
                  const set = useLibrary.getState().sets[setId];
                  const first = set?.langs?.[0];
                  if (!set || !first) return;
                  updateSet(setId, {
                    slides: transposeLangColumn(
                      set.slides,
                      first,
                      (line) => transposeLyrics(line, fromKey, toKey),
                      shownLangs(set.langs ?? [], set.langsShown),
                    ),
                  });
                  setGridKey((k) => k + 1);
                }}
              >
                <span className="inline-flex shrink-0 items-center gap-2">
                  <span className="mono whitespace-nowrap text-[10px] uppercase tracking-wider">
                    {phone ? "L/S" : "Lines per slide"}
                  </span>
                  <NumberStepper
                    value={multiPer}
                    format={(n) => (customBreaks ? "C" : String(n))}
                    onChange={(n) => {
                      const next = Math.min(MAX_LANG_LINES_PER, Math.max(1, Math.round(n)));
                      // From C, re-dividing replaces the hand-placed breaks: ask.
                      if (customBreaks) setPendingLinesPerConfirm(next);
                      else updateSet(setId, { langLinesPer: next });
                    }}
                    min={1}
                    max={MAX_LANG_LINES_PER}
                    decrementLabel="Fewer lines per slide"
                    incrementLabel="More lines per slide"
                  />
                </span>
                {songToggles}
                {!phone && <div ref={setToolbarSlot} className="contents" />}
              </ChordControls>
            )}
            {songLayout === "multilang" && phone && (
              // Two languages at a time: tap one to swap it in for the one shown
              // longest. + adds a language; the chips scroll sideways in one row.
              <div className="-mx-4 -mb-4 mt-3 flex items-center gap-1.5 border-t border-foreground/20 py-2.5 pl-4">
                <div ref={setLangAddSlot} className="contents" />
                <div className="catalogue-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-4">
                  {(songLangCols ?? []).map((code) => {
                    const on = langPair.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() =>
                          setPickedLangs((p) => tapPairLang(songLangCols ?? [], p, code))
                        }
                        className="mono flex h-7 shrink-0 items-center rounded-full border px-3 text-xs uppercase tracking-wider transition"
                        style={{
                          borderColor: langColor(code),
                          backgroundColor: on ? langColor(code) : "transparent",
                          color: on ? "var(--brand-white)" : undefined,
                        }}
                        aria-pressed={on}
                        title={langDef(code).label}
                      >
                        {langDef(code).short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </PhoneFold>
        </div>

        {songLayout === "multilang" && (
          <div className="min-h-0 flex-1 overflow-hidden">
            <MultiLangLyricEditor
              key={gridKey}
              setId={setId}
              toolbarSlot={toolbarSlot}
              langAddSlot={langAddSlot}
              visibleLangs={phone ? langPair : undefined}
            />
          </div>
        )}
        {songLayout === "response" && (
          <div className="min-h-0 flex-1 overflow-hidden">
            <ResponseLyricEditor
              lyrics={lyrics}
              roles={roles}
              chords={chordCfg && !chordCfg.hidden ? chordCfg : undefined}
              toolbarSlot={toolbarSlot}
              phone={!!phone}
              onCommit={(text, nextRoles, { typing, breaks } = {}) => {
                if (breaks) markCustomBreaks();
                if (typing) pushHistory();
                else {
                  lastPush.current = 0;
                  pushHistory();
                }
                setRoles(nextRoles);
                setLyrics(text);
              }}
              onUndo={undoLyrics}
              onRedo={redoLyrics}
            />
          </div>
        )}
        {/* Phone: + Section and + Slide break along the bottom, above the
            tabs (portalled in by the grid editors). */}
        {phone && songLayout !== "standard" && <PhoneDock slotRef={setToolbarSlot} />}
        {/* Lyrics textarea — fills remaining height */}
        <div
          className={`relative min-h-0 flex-1 overflow-hidden ${songLayout === "standard" ? "" : "hidden"}`}
        >
          <Textarea
            ref={lyricsRef}
            value={boxText}
            onChange={(e) => {
              // Editing a chord-carrying line — its own row, or the lyric
              // beneath it — always reflows that row's column padding, since
              // it's rebuilt from scratch rather than patched in place. A
              // controlled textarea whose value changes out from under it
              // resets the browser's own caret to the end, so the position
              // has to be carried across the reflow by hand, onto the word
              // that line's chords sit over.
              const before =
                !chordsHidden && caretRef.current !== null
                  ? boxOffsetLine(lyrics, caretRef.current, chordLabel)
                  : null;
              const { value: boxValue, selectionStart: boxCaret } = e.target;
              const next = commitFromBox(boxValue);
              // A --- typed or deleted by hand: the breaks are now custom.
              if (breakCount(next) !== breakCount(lyrics)) markCustomBreaks();
              if (before && before.kind !== "plain") {
                // The caret goes back exactly where the keystroke left it, on
                // whichever line that was. caretRef still holds the
                // pre-keystroke position here (onSelect fires after onChange),
                // so the post-edit column comes off the event instead.
                const caret =
                  before.kind === "lyric"
                    ? caretAfterLyricEdit(next, before.storedLine, boxValue, boxCaret, chordLabel)
                    : caretAfterRowEdit(next, before.storedLine, boxValue, boxCaret, chordLabel);
                caretRef.current = caret;
                requestAnimationFrame(() => lyricsRef.current?.setSelectionRange(caret, caret));
              }
            }}
            onPaste={handleLyricsPaste}
            onSelect={(e) => (caretRef.current = e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                // Break the line on the stored lyrics rather than in the box, so
                // the chords past the caret come down with their words instead of
                // being left behind on the row above. Only with a plain caret and
                // chords on show — a selection is a replace, and while chords are
                // hidden the box has no rows and reapplyChords handles it.
                if (e.currentTarget.selectionStart !== e.currentTarget.selectionEnd) return;
                if (chordsHidden || !hasChords(lyrics)) return;
                const broken = breakLineAtBoxOffset(
                  lyrics,
                  e.currentTarget.selectionStart,
                  chordLabel,
                );
                if (!broken) return;
                e.preventDefault();
                handleLyricsChange(broken.lyrics);
                caretRef.current = broken.caret;
                requestAnimationFrame(() => {
                  lyricsRef.current?.focus();
                  lyricsRef.current?.setSelectionRange(broken.caret, broken.caret);
                });
                return;
              }
              if (!e.metaKey && !e.ctrlKey) return;
              const k = e.key.toLowerCase();
              if (k === "z") {
                e.preventDefault();
                if (e.shiftKey) redoLyrics();
                else undoLyrics();
              } else if (k === "y") {
                e.preventDefault();
                redoLyrics();
              }
            }}
            placeholder={
              `Paste lyrics here, or select a song above.\n` +
              `Use --- to split slides. Label sections with [Verse 1], [Chorus], etc.` +
              (chordCfg && !chordsHidden
                ? `\nPaste a chord sheet, or type a chord on the row above the word it belongs to. They never show on the projector. Pasting doesn't always guess the right key, double-check it below.`
                : "")
            }
            className={`mono h-full w-full resize-none rounded-none border-0 bg-transparent py-4 text-xs shadow-none focus-visible:ring-0 ${phone ? "px-4" : "pl-5 pr-5"}`}
          />
        </div>

        {/* Hover preview — chorus (or top of song) following the cursor. */}
        {preview &&
          preview.text &&
          (() => {
            const W = 240,
              H = 200,
              GAP = 16;
            const vw = window.innerWidth,
              vh = window.innerHeight;
            const left =
              preview.x + W + GAP > vw ? Math.max(8, preview.x - W - GAP) : preview.x + GAP;
            const top =
              preview.y + H + GAP > vh ? Math.max(8, preview.y - H - GAP) : preview.y + GAP;
            return (
              <div
                className="mono pointer-events-none fixed z-50 whitespace-pre-line rounded-2xl border border-foreground bg-background p-3 text-[11px] leading-relaxed shadow-lg"
                style={{
                  left,
                  top,
                  width: W,
                  maxHeight: H,
                  overflow: "hidden",
                }}
              >
                {preview.text}
              </div>
            );
          })()}

        <AlertDialog
          open={pendingLinesPerConfirm !== null}
          onOpenChange={(o) => {
            if (!o) {
              setPendingLinesPerConfirm(null);
              if (songLayout !== "multilang") setLinesPer(prevLinesPer.current);
            }
          }}
        >
          <AlertDialogContent className="gap-0 rounded-3xl p-8">
            <AlertDialogTitle className="text-2xl font-normal leading-tight">
              Reset slide dividers?
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-4 text-base text-foreground">
              This will reset your slide dividers. Your text edits will be kept.
            </AlertDialogDescription>
            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const next = pendingLinesPerConfirm!;
                  if (songLayout === "multilang") {
                    updateSet(setId, { langLinesPer: next, customBreaks: undefined });
                    setPendingLinesPerConfirm(null);
                    return;
                  }
                  updateSet(setId, { customBreaks: undefined });
                  prevLinesPer.current = next;
                  setLinesPer(next);
                  const divided = applyDividers(lyrics, next);
                  setRoles((r) => remapRoles(lyrics, divided, r));
                  setLyrics(divided);
                  setPendingLinesPerConfirm(null);
                }}
                className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingLinesPerConfirm(null);
                  if (songLayout !== "multilang") setLinesPer(prevLinesPer.current);
                }}
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

  if (kind === "scripture" || kind === "message") {
    return (
      <div className={`flex h-full flex-col overflow-hidden ${phone ? "has-dock relative" : ""}`}>
        {/* API lookup section — persistent, above the verse/block editor, so you
            can import more passages while adding points and images. */}
        <div className="relative z-20 shrink-0 border-b border-foreground/20 p-4">
          <PhoneFold
            enabled={!!phone}
            title="Import"
            open={importOpen}
            onToggle={() => setImportOpen((o) => !o)}
          >
            {/* While the set's versions don't match the workspace, importing more
              is frozen (greyed, inert) until it's resolved: UPDATE below, or
              delete the verses. */}
            <div className={scripture.frozen ? "hidden" : ""}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <PillInput
                    small={!!phone}
                    value={ref}
                    onChange={setRef}
                    placeholder={
                      phone ? "e.g. John 3:16-18" : "e.g. John 3, John 3:16-18, John 3:21-John 4:2"
                    }
                    onEnter={() => {
                      if (ref.trim() && !busy && !scripture.frozen) importScripture();
                    }}
                  />
                </div>
                {/* Phone: one version sits beside the search; two get their own row. */}
                {phone && !scripture.twoVersions && (
                  <div className="w-24 shrink-0">
                    <VersionPicker
                      compact
                      label="Version"
                      value={translation}
                      open={versionOpen}
                      setOpen={setVersionOpen}
                      onPick={setTranslation}
                      exclude=""
                      groups={scripture.versionGroups}
                      recent={scripture.recentVersions}
                    />
                  </div>
                )}
                {!phone && (
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="pill mono uppercase shrink-0 border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
                  >
                    Settings
                  </button>
                )}
              </div>
              <ScriptureSettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                twoVersions={scripture.twoVersions}
                setTwoVersions={scripture.setTwoVersions}
                busy={busy}
                versesPer={versesPer}
                setVersesPer={setVersesPer}
                maxVerses={scripture.bilingual ? 2 : 3}
                keepLineBreaks={keepLineBreaks}
                setKeepLineBreaks={setKeepLineBreaks}
                versionRefs={scripture.versionRefs}
                setVersionRefs={scripture.setVersionRefs}
                refPerSlide={scripture.refPerSlide}
                setRefPerSlide={(on) => void scripture.setRefPerSlide(on)}
              />
              {/* Phone, two versions: 1st, a swap arrow, 2nd, on one row. */}
              {phone && scripture.twoVersions && (
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5">
                  <VersionPicker
                    label="1st"
                    value={translation}
                    open={versionOpen}
                    setOpen={setVersionOpen}
                    onPick={setTranslation}
                    exclude={translation2}
                    groups={scripture.versionGroups}
                    recent={scripture.recentVersions}
                  />
                  <button
                    type="button"
                    onClick={scripture.swapVersions}
                    disabled={!scripture.bilingual}
                    className="pill flex h-9 w-9 items-center justify-center transition active:bg-foreground/15 disabled:opacity-30"
                    title="Swap versions"
                    aria-label="Swap versions"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>
                  <VersionPicker
                    label="2nd"
                    value={translation2}
                    placeholder="Choose"
                    open={version2Open}
                    setOpen={setVersion2Open}
                    onPick={setTranslation2}
                    exclude={translation}
                    groups={scripture.versionGroups}
                    recent={scripture.recentVersions}
                  />
                </div>
              )}
              <div className={`mt-3 grid grid-cols-2 gap-3 ${phone ? "hidden" : ""}`}>
                <div className={scripture.twoVersions ? "" : "col-span-2"}>
                  <VersionPicker
                    label={scripture.twoVersions ? "1st version" : "Version"}
                    value={translation}
                    open={versionOpen}
                    setOpen={setVersionOpen}
                    onPick={setTranslation}
                    exclude={scripture.twoVersions ? translation2 : ""}
                    groups={scripture.versionGroups}
                    recent={scripture.recentVersions}
                  />
                </div>
                {scripture.twoVersions && (
                  <VersionPicker
                    label="2nd version"
                    value={translation2}
                    placeholder="Choose a version"
                    open={version2Open}
                    setOpen={setVersion2Open}
                    onPick={setTranslation2}
                    exclude={translation}
                    groups={scripture.versionGroups}
                    recent={scripture.recentVersions}
                  />
                )}
              </div>
              {scripture.bilingual && !phone && (
                <button
                  type="button"
                  onClick={scripture.swapVersions}
                  className="mono mt-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeftRight className="h-3 w-3" /> Swap versions
                </button>
              )}
              {alignNote && (
                <p className="mono mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {alignNote}
                </p>
              )}
            </div>
            {scripture.versionsMismatch && (
              <div className="mono flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-foreground/30 px-4 py-2 text-[10px] uppercase tracking-wider">
                <span className="text-muted-foreground">
                  This set is in {languagesOfVersions(scripture.storedVersions)}.
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openUpdateVersions("reimport")}
                    className="rounded-full bg-foreground px-3 py-1 uppercase text-background transition hover:opacity-90 disabled:opacity-40"
                  >
                    Re-import
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openUpdateVersions("duplicate")}
                    className="rounded-full border border-foreground px-3 py-1 uppercase transition hover:bg-foreground hover:text-background disabled:opacity-40"
                  >
                    Duplicate
                  </button>
                </span>
              </div>
            )}
            <AlertDialog open={showUpdateVersions} onOpenChange={setShowUpdateVersions}>
              <AlertDialogContent className="gap-0 rounded-3xl p-8">
                <AlertDialogTitle className="text-2xl font-normal leading-tight">
                  {updateMode === "duplicate" ? "Duplicate?" : "Re-import?"}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-4 text-base text-foreground">
                  {updateMode === "duplicate"
                    ? "A copy of this set is made with every passage fetched in these bible versions. This set stays as it is."
                    : "Every passage in this set is fetched again in these bible versions."}
                </AlertDialogDescription>
                {/* Who else sees the change: each group and person the set is
                  shared with (or its owner), with their workspace languages.
                  A duplicate changes nothing for them. */}
                {updateMode === "reimport" &&
                  (updateAudience.owner ||
                    updateAudience.groups.length > 0 ||
                    updateAudience.people.length > 0) && (
                    <div className="mono mt-5 text-[10px] uppercase tracking-wider">
                      <div className="text-muted-foreground">Changes affect</div>
                      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-6 gap-y-0.5">
                        {[
                          ...(updateAudience.owner ? [updateAudience.owner] : []),
                          ...updateAudience.groups,
                          ...updateAudience.people,
                        ].map((name) => (
                          <Fragment key={name}>
                            {/* Group names keep their case; emails read in caps. */}
                            <span
                              className={`min-w-0 truncate ${updateAudience.groups.includes(name) ? "normal-case" : ""}`}
                            >
                              {name}
                            </span>
                            <span className="text-muted-foreground">
                              {updateAudience.languages[name] ?? ""}
                            </span>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                <div
                  className={`mt-6 grid gap-3 ${scripture.bilingual ? "grid-cols-2" : "grid-cols-1"}`}
                >
                  <VersionPicker
                    label={scripture.bilingual ? "1st version" : "Version"}
                    value={updateV1}
                    open={updateV1Open}
                    setOpen={setUpdateV1Open}
                    onPick={setUpdateV1}
                    exclude={updateV2}
                    groups={scripture.versionGroups}
                    recent={scripture.recentVersions}
                  />
                  {scripture.bilingual && (
                    <VersionPicker
                      label="2nd version"
                      value={updateV2}
                      placeholder="None"
                      open={updateV2Open}
                      setOpen={setUpdateV2Open}
                      onPick={setUpdateV2}
                      onClear={() => setUpdateV2("")}
                      exclude={updateV1}
                      groups={scripture.versionGroups}
                      recent={scripture.recentVersions}
                    />
                  )}
                </div>
                <div className="mt-8 flex gap-3">
                  <button
                    type="button"
                    disabled={!updateV1}
                    onClick={() => {
                      setShowUpdateVersions(false);
                      if (updateMode === "duplicate") {
                        void scripture.duplicateToVersions(updateV1, updateV2).then((id) => {
                          if (id) navigate({ to: "/set/$setId", params: { setId: id } });
                        });
                      } else {
                        void scripture.updateVersionsToWorkspace(updateV1, updateV2);
                      }
                    }}
                    className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
                  >
                    {updateMode === "duplicate" ? "Duplicate" : "Re-import"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUpdateVersions(false)}
                    className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
                  >
                    Cancel
                  </button>
                </div>
              </AlertDialogContent>
            </AlertDialog>
            {err && (
              <p className="mono mt-2 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
                {err}
              </p>
            )}
            {!scripture.frozen && (
              <button
                onClick={importScripture}
                disabled={!ref.trim() || busy}
                className={`mono uppercase pill mt-3 w-full bg-foreground text-background transition hover:opacity-90 disabled:opacity-50 ${phone ? "py-2 text-xs tracking-wider" : "py-2.5 text-sm"}`}
              >
                {busy ? "Fetching…" : "Import"}
              </button>
            )}
            {!scripture.frozen && !phone && (
              <AddElementBar setId={setId} onManualVerse={scripture.addManualVerse} />
            )}
          </PhoneFold>
        </div>

        {/* Body: a message owns its slides (draggable block editor); a plain
            scripture shows its imported verses (editable) with the add-bar below,
            so a passage can grow points and images without leaving this view. */}
        {kind === "message" ? (
          <MessageBlockEditor
            setId={setId}
            versions={scripture.boxMode ? scripture.editVersions : SINGLE_VERSION}
            primaryVersion={scripture.boxMode ? scripture.primaryVersion : undefined}
            readOnly={scripture.frozen}
            onManualVerse={scripture.frozen ? undefined : scripture.addManualVerse}
          />
        ) : (
          <div data-editor-scroll className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {(manualText.trim() || manualText2.trim()) &&
              (scripture.boxMode ? (
                <ScriptureVerseEditor
                  versions={scripture.editVersions}
                  text={Object.fromEntries(
                    scripture.editVersions.map((v, i) => [v, i === 0 ? manualText : manualText2]),
                  )}
                  setText={(v, val) =>
                    v === scripture.editVersions[0] ? setManualText(val) : setManualText2(val)
                  }
                  readOnly={scripture.frozen}
                />
              ) : (
                <ScriptureVerseEditor
                  versions={SINGLE_VERSION}
                  text={{ _: manualText }}
                  setText={(_v, val) => setManualText(val)}
                  readOnly={scripture.frozen}
                />
              ))}
            {!scripture.frozen && (
              <MessageElements hasVerses={!!(manualText.trim() || manualText2.trim())} />
            )}
          </div>
        )}
        {/* Phone: add a point, an image or a verse from the dock. */}
        {phone && !scripture.frozen && (
          <PhoneDock>
            <AddElementBar setId={setId} onManualVerse={scripture.addManualVerse} icons />
          </PhoneDock>
        )}
      </div>
    );
  }

  return <MediaImporter setId={setId} onImport={importImages} />;
}

/** Rasterise each page of a PDF to a JPEG blob.
 *
 *  Pages are scaled so the longest edge lands near IMAGE_MAX_DIM instead of the
 *  old fixed 2.0, and encoded at IMAGE_QUALITY instead of the browser default
 *  (0.92). A fixed 2.0 scale on a large page produced ~4000px JPEGs, which is
 *  how a single imported deck reached 7.7MB inside `sets.content`. */
async function pdfToImageBlobs(file: File): Promise<Blob[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const blobs: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const unscaled = page.getViewport({ scale: 1 });
      const longest = Math.max(unscaled.width, unscaled.height);
      const scale = Math.min(2.0, IMAGE_MAX_DIM / longest);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", IMAGE_QUALITY),
      );
      if (blob) blobs.push(blob);
    } catch {
      // skip failed pages silently
    }
  }

  return blobs;
}

function MediaImporter({
  setId,
  onImport,
}: {
  setId: string;
  onImport: (files: FileList | null) => void;
}) {
  const { addSlide } = useLibrary();
  const [over, setOver] = useState(false);
  const [converting, setConverting] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || converting) return;
    const imageFiles = Array.from(files).filter((f) => isUploadableImage(f.type));
    const pdfFiles = Array.from(files).filter((f) => f.type === "application/pdf");

    if (imageFiles.length > 0) {
      const imageList = new DataTransfer();
      imageFiles.forEach((f) => imageList.items.add(f));
      onImport(imageList.files);
    }

    if (pdfFiles.length > 0) {
      setConverting(true);
      for (const pdf of pdfFiles) {
        try {
          for (const blob of await pdfToImageBlobs(pdf)) {
            const img = await prepareRenderedImage(blob);
            if (img) addSlide(setId, { kind: "image", imageUrl: img.url, lines: [] });
          }
        } catch {
          // skip failed files silently
        }
      }
      setConverting(false);
    }
  };

  return (
    <PanelCard label="Import images">
      <label
        onDragOver={(e) => {
          if (converting) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!converting && e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={`mono flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs uppercase tracking-wider transition ${
          converting
            ? "cursor-wait border-foreground/30 text-muted-foreground"
            : over
              ? "border-foreground bg-foreground/5"
              : "border-foreground/60 text-muted-foreground hover:border-foreground"
        }`}
      >
        {converting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Converting…
          </>
        ) : over ? (
          "Drop to upload"
        ) : (
          "Drop images or PDFs here or click to browse"
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,application/pdf"
          multiple
          disabled={converting}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
    </PanelCard>
  );
}

/** Phone: the title row as a gathering search; picking one adds the set. */
function PhoneAddToGathering({ setId, onClose }: { setId: string; onClose: () => void }) {
  const gatherings = useLibrary((s) => s.gatherings);
  const gatheringOrder = useLibrary((s) => s.gatheringOrder);
  const addSetToGathering = useLibrary((s) => s.addSetToGathering);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = q
      ? gatheringOrder.filter((pid) => gatherings[pid]?.name.toLowerCase().includes(q))
      : gatheringOrder;
    return ids.map((pid) => gatherings[pid]).filter(Boolean);
  }, [query, gatherings, gatheringOrder]);
  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-1">
      <div className="pill flex min-w-0 flex-1 items-center gap-2 border border-foreground bg-background px-4 py-2">
        <Plus className="h-4 w-4 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(onClose, 150)}
          placeholder="Add to a gathering"
          className="mono uppercase min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClose}
        className="pill flex h-10 w-10 shrink-0 items-center justify-center active:bg-foreground/15"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="absolute left-0 right-11 top-full z-30 mt-1 max-h-72 overflow-auto rounded-2xl border border-foreground bg-popover shadow-md">
        {matches.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No gatherings found.</p>
        ) : (
          matches.map((p) => (
            <button
              key={p.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                addSetToGathering(p.id, setId);
                onClose();
              }}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm active:bg-muted"
            >
              <span className="truncate">{p.name}</span>
              <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {p.setIds.length} sets
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function AddToGathering({
  setId,
  onAdded,
}: {
  setId: string;
  onAdded?: (gatheringId: string) => void;
}) {
  const gatherings = useLibrary((s) => s.gatherings);
  const gatheringOrder = useLibrary((s) => s.gatheringOrder);
  const addSetToGathering = useLibrary((s) => s.addSetToGathering);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = q
      ? gatheringOrder.filter((pid) => gatherings[pid]?.name.toLowerCase().includes(q))
      : gatheringOrder;
    return ids.map((pid) => gatherings[pid]).filter(Boolean);
  }, [query, gatherings, gatheringOrder]);

  return (
    <div className="relative">
      <div className="pill flex items-center gap-2 border border-foreground bg-background px-4 py-2">
        <Plus className="h-4 w-4" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setAdded(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={added ? `Added to ${added}` : "Add to a gathering"}
          className="mono uppercase w-44 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute right-0 z-10 mt-1 max-h-60 w-72 overflow-auto rounded-2xl border border-foreground bg-popover shadow-md">
          {matches.map((p) => (
            <button
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault();
                addSetToGathering(p.id, setId);
                onAdded?.(p.id);
                setAdded(p.name);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="truncate">{p.name}</span>
              <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {p.setIds.length} sets
              </span>
            </button>
          ))}
        </div>
      )}
      {open && matches.length === 0 && (
        <div className="absolute right-0 z-10 mt-1 w-72 rounded-2xl border border-foreground bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          No gatherings found.
        </div>
      )}
    </div>
  );
}
