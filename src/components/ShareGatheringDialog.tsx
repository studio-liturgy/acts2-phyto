import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check } from "lucide-react";
import { GatheringPhonePreview } from "@/components/GatheringPhonePreview";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { normalizeSlug, slugErrorMessage, validateSlug, type SlugError } from "@/lib/slug";

type SlugSaveResult = { ok: true } | { ok: false; reason: SlugError | "taken" | "offline" };

/**
 * Go live / Share dialog, to his mock-ups. Going live or live: a header bar
 * ("Share <name> to your friends!"), the gathering's phone view on the left
 * and on the right either the big Go Live circle (`step="confirm"`) or the QR
 * code (colours, PNG download), the link (copy, Customize link) and End
 * Session. Nothing live: just "Share your link!" with the QR code and link.
 * Shared by the home catalogue (`GatheringCard`) and the presenter top bar so
 * the two stay in lockstep.
 */
export function ShareGatheringDialog({
  open,
  onOpenChange,
  shareUrl,
  gatheringName,
  isLive,
  slug,
  onSlugSave,
  gatheringId,
  step: startStep = "share",
  onGoLive,
  onEndSession,
}: {
  /** The gathering shown in the phone preview. */
  gatheringId: string | null;
  /** What the right side opens on: the Go live confirmation, or the link. */
  step?: "confirm" | "share";
  /** Go live (the confirmation's button); the link view follows. */
  onGoLive?: () => Promise<void>;
  /** End the live session (the End Session button, shown while live). */
  onEndSession?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
  gatheringName: string;
  isLive: boolean | null;
  /** Current URL slug (share_token). Required to enable the custom-link editor. */
  slug?: string;
  /** Provided only when the viewer may customize the link (the owner). Absent =
   *  the slug is shown as a static, read-only part of the URL. */
  onSlugSave?: (slug: string) => Promise<SlugSaveResult>;
}) {
  const [step, setStep] = useState(startStep);
  const [goingLive, setGoingLive] = useState(false);
  const [wentLive, setWentLive] = useState(false);
  useEffect(() => {
    if (open) setStep(startStep);
    else setWentLive(false);
  }, [open, startStep]);
  const [copiedShare, setCopiedShare] = useState(false);
  const editable = !!onSlugSave && slug !== undefined;
  const [editingSlug, setEditingSlug] = useState(false);
  const [draftSlug, setDraftSlug] = useState(slug ?? "");
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  // Re-seed the draft whenever the live slug changes (a successful save, or a
  // different gathering opening the dialog) and drop any stale editing state.
  useEffect(() => {
    setDraftSlug(slug ?? "");
    setEditingSlug(false);
    setSlugError(null);
  }, [slug, open]);

  const normalizedDraft = normalizeSlug(draftSlug);

  const saveSlug = async () => {
    if (!onSlugSave) return;
    const check = validateSlug(normalizedDraft);
    if (!check.ok) {
      setSlugError(slugErrorMessage(check.reason));
      return;
    }
    setSavingSlug(true);
    setSlugError(null);
    const res = await onSlugSave(normalizedDraft);
    setSavingSlug(false);
    if (res.ok) {
      setEditingSlug(false);
    } else if (res.reason === "taken") {
      setSlugError("That link is already taken. Try another.");
    } else if (res.reason === "offline") {
      setSlugError("Sign in to customize the link.");
    } else {
      setSlugError(slugErrorMessage(res.reason));
    }
  };
  const cancelEdit = () => {
    setEditingSlug(false);
    setDraftSlug(slug ?? "");
    setSlugError(null);
  };
  const [qrFg, setQrFg] = useState("#212121");
  const [qrBg, setQrBg] = useState("#ffffff");
  const [qrTransparent, setQrTransparent] = useState(false);
  const shareQrRef = useRef<HTMLCanvasElement>(null);
  const qrFgCustomRef = useRef<HTMLInputElement>(null);

  const QR_FG_PRESETS = qrTransparent
    ? ["#212121", "#F5EFEF", "#2E7299", "#538844", "#E07D31", "#C01E21"]
    : qrBg === "#000000"
      ? ["#F5EFEF", "#2E7299", "#538844", "#E07D31", "#C01E21"]
      : ["#212121", "#2E7299", "#538844", "#E07D31", "#C01E21"];

  const setQrBackground = (bg: string | null) => {
    if (bg === null) {
      setQrTransparent(true);
    } else {
      setQrTransparent(false);
      setQrBg(bg);
      if (bg === "#ffffff" && qrFg === "#F5EFEF") setQrFg("#212121");
      if (bg === "#000000" && qrFg === "#212121") setQrFg("#F5EFEF");
    }
  };

  const downloadQr = (filename: string) => {
    const canvas = shareQrRef.current;
    if (!canvas) return;
    const padding = 20;
    const out = document.createElement("canvas");
    out.width = canvas.width + padding * 2;
    out.height = canvas.height + padding * 2;
    const ctx = out.getContext("2d")!;
    if (!qrTransparent) {
      ctx.fillStyle = qrBg;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.drawImage(canvas, padding, padding);
    const url = out.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  // Just went live here: keep the two panels while the live flag catches up.
  const twoPanel = step === "confirm" || !!isLive || wentLive;
  const NOTE = "mono text-[10px] uppercase leading-snug tracking-wider text-foreground/80";
  const STAYS_LIVE =
    "This gathering will stay live until you end it or go live on another one. If it's left running, it ends on its own after 14 days.";
  const swatch = (selected: boolean): React.CSSProperties => ({
    borderColor: selected
      ? "var(--foreground)"
      : "color-mix(in srgb, var(--foreground) 20%, transparent)",
  });

  // The QR code with its colours and download, side by side.
  const qrBlock = shareUrl ? (
    <div className="flex items-center gap-8">
      <div
        className="shrink-0 rounded-2xl p-3"
        style={
          qrTransparent
            ? {
                backgroundImage:
                  "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
                backgroundSize: "10px 10px",
                backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
              }
            : { backgroundColor: qrBg }
        }
      >
        <QRCodeCanvas
          ref={shareQrRef}
          value={shareUrl}
          size={150}
          fgColor={qrFg}
          bgColor={qrTransparent ? "transparent" : qrBg}
        />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <span className="mono w-24 pt-1 text-[10px] uppercase tracking-wider">Dots</span>
          <div className="grid grid-cols-3 gap-2">
            {QR_FG_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setQrFg(c)}
                className="h-6 w-6 rounded-full border-2 transition"
                style={{ backgroundColor: c, ...swatch(qrFg === c) }}
                aria-label={`Dots ${c}`}
              />
            ))}
            <button
              type="button"
              onClick={() => qrFgCustomRef.current?.click()}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 transition"
              style={{
                ...swatch(false),
                backgroundColor: QR_FG_PRESETS.includes(qrFg) ? "transparent" : qrFg,
                color: "var(--foreground)",
              }}
              aria-label="Custom dot colour"
            >
              {QR_FG_PRESETS.includes(qrFg) && <span className="text-xs leading-none">+</span>}
            </button>
            <input
              ref={qrFgCustomRef}
              type="color"
              value={qrFg}
              onChange={(e) => setQrFg(e.target.value)}
              className="sr-only"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="mono w-24 text-[10px] uppercase tracking-wider">Background</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setQrBackground("#000000")}
              className="h-6 w-6 rounded-full border-2 transition"
              style={{
                backgroundColor: "#000000",
                ...swatch(!qrTransparent && qrBg === "#000000"),
              }}
              aria-label="Black background"
            />
            <button
              type="button"
              onClick={() => setQrBackground("#ffffff")}
              className="h-6 w-6 rounded-full border-2 transition"
              style={{
                backgroundColor: "#ffffff",
                ...swatch(!qrTransparent && qrBg === "#ffffff"),
              }}
              aria-label="White background"
            />
            <button
              type="button"
              onClick={() => setQrBackground(null)}
              className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 p-0 transition"
              style={swatch(qrTransparent)}
              aria-label="Transparent background"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" style={{ display: "block" }}>
                <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="#212121" />
                <path d="M12 22 A10 10 0 0 1 12 2 Z" fill="#F5EFEF" />
              </svg>
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => downloadQr(`${gatheringName}-qr.png`)}
          className="mono uppercase self-start rounded-full border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
        >
          Download PNG
        </button>
      </div>
    </div>
  ) : null;

  // The link bar with copy, then Customize link under it.
  const linkBlock = (
    <div>
      <div className="flex items-center overflow-hidden rounded-full border border-foreground">
        {editingSlug ? (
          <>
            <span className="pl-4 font-mono text-sm uppercase text-muted-foreground">/g/</span>
            <input
              autoFocus
              value={draftSlug}
              onChange={(e) => {
                setDraftSlug(e.target.value);
                setSlugError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveSlug();
                if (e.key === "Escape") cancelEdit();
              }}
              disabled={savingSlug}
              className="flex-1 bg-transparent py-2 pr-3 font-mono text-sm uppercase text-foreground outline-none"
              placeholder="my-gathering"
            />
            <button
              type="button"
              onClick={saveSlug}
              disabled={savingSlug}
              className="mono uppercase flex h-10 items-center rounded-full bg-foreground px-5 text-xs tracking-wider text-background transition hover:opacity-90 disabled:opacity-50"
            >
              {savingSlug ? "Saving" : "Save"}
            </button>
          </>
        ) : (
          <>
            {/* Empty while the account slug resolves (no seed flash): a quiet
                placeholder, and copy waits until it lands. */}
            <span
              className={`flex-1 truncate px-4 font-mono text-sm uppercase ${shareUrl ? "text-foreground" : "text-muted-foreground"}`}
            >
              {shareUrl || "Loading link"}
            </span>
            <button
              type="button"
              disabled={!shareUrl}
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                setCopiedShare(true);
                setTimeout(() => setCopiedShare(false), 2000);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90 disabled:opacity-40"
              aria-label="Copy URL"
            >
              {copiedShare ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>
      {editable && editingSlug && slugError && (
        <p className="mono mt-2 px-4 text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
          {slugError}
        </p>
      )}
      {editable && !editingSlug && (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={() => setEditingSlug(true)}
            className="mono text-[10px] uppercase tracking-wider text-muted-foreground underline underline-offset-2 transition hover:text-foreground"
          >
            Customize link
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (goingLive) return;
        onOpenChange(o);
      }}
    >
      {twoPanel ? (
        <DialogContent
          className="flex max-w-[58rem] flex-col gap-0 overflow-hidden rounded-3xl p-0"
          aria-describedby={undefined}
        >
          {/* Laid out like the set editor: a header bar, then two columns
              split by a full-height line. */}
          <header className="shrink-0 border-b border-foreground py-5 pl-8 pr-14">
            <DialogTitle className="truncate text-2xl font-normal leading-tight">
              Share {gatheringName} to your friends!
            </DialogTitle>
          </header>
          <div className="grid h-[min(51rem,78vh)] min-h-0 grid-cols-2 divide-x divide-foreground">
            {/* Left: what phones get. */}
            <div className="min-h-0 px-8 py-8">
              {gatheringId && <GatheringPhonePreview gatheringId={gatheringId} />}
            </div>

            {/* Right: the Go Live circle, or the QR code, link and End Session. */}
            <div className="flex min-h-0 flex-col overflow-y-auto px-8 py-8">
              {step === "confirm" ? (
                <>
                  <div className="flex flex-1 items-start justify-center pt-12">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!onGoLive) return;
                        setGoingLive(true);
                        try {
                          await onGoLive();
                          setWentLive(true);
                          setStep("share");
                        } finally {
                          setGoingLive(false);
                        }
                      }}
                      disabled={goingLive}
                      className={`mono flex aspect-square w-full max-w-[24.5rem] items-center justify-center rounded-full border border-[var(--brand-red)] text-sm uppercase tracking-wider transition-colors hover:animate-pulse hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)] ${
                        goingLive
                          ? "animate-pulse bg-[var(--brand-red)] text-[var(--brand-white)]"
                          : "text-[var(--brand-red)]"
                      }`}
                    >
                      {goingLive ? "Going Live..." : "Go Live"}
                    </button>
                  </div>
                </>
              ) : (
                // The QR code and link sit low, just above the note.
                <div className="flex flex-1 flex-col justify-end pb-12">
                  {qrBlock}
                  <div className="mt-12">{linkBlock}</div>
                </div>
              )}
              {/* The note and the End Session row hold the same place before
                  and after going live, so nothing moves. Before, the row is
                  kept as empty space. */}
              <p className={NOTE}>{STAYS_LIVE}</p>
              {step !== "confirm" && onEndSession ? (
                <button
                  type="button"
                  onClick={() => {
                    onEndSession();
                    onOpenChange(false);
                  }}
                  className="mono mt-12 w-full rounded-full border border-[var(--brand-red)] py-4 text-xs uppercase tracking-wider text-[var(--brand-red)] transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]"
                >
                  End Session
                </button>
              ) : (
                <div aria-hidden className="mt-12 h-[50px] shrink-0" />
              )}
            </div>
          </div>
        </DialogContent>
      ) : (
        <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
          {/* Nothing live: the link and its QR code only. */}
          <DialogTitle className="text-2xl font-normal leading-tight">Share your link!</DialogTitle>
          <div className="mt-8">{qrBlock}</div>
          <div className="mt-14">{linkBlock}</div>
          <p className={`${NOTE} mt-8`}>
            Whatever gathering goes live will be accessible at this link.
          </p>
        </DialogContent>
      )}
    </Dialog>
  );
}
