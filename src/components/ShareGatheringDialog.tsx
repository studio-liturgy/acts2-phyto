import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check } from "lucide-react";
import { GatheringPhonePreview } from "@/components/GatheringPhonePreview";
import { ColorPicker } from "@/components/ColorPicker";
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
  showPreview = true,
  phone = false,
}: {
  /** The phone layout: a full-screen sheet, one column, the QR code above its
   *  colours, the phone's own share menu under the link, and End Session. */
  phone?: boolean;
  /** Show the phone preview (and the live two-panel view). The presenter
   *  turns it off: it has its own preview, so Share there is just the QR code
   *  and link. Going live keeps the two panels either way. */
  showPreview?: boolean;
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
  // Reset on opening, never on closing: changing what's shown while the
  // close animation runs made the dialog collapse before it disappeared.
  useEffect(() => {
    if (open) setStep(startStep);
  }, [open, startStep]);
  useEffect(() => {
    if (open) setWentLive(false);
  }, [open]);
  // The QR code and link appear together, once the link is known. Going live
  // holds on "Going Live..." until then (or 8 seconds, so it never sticks).
  const ready = !!shareUrl;
  const [shown, setShown] = useState(true);
  const reveal = `transition-opacity duration-500 ease-out ${
    ready && shown ? "opacity-100" : "pointer-events-none opacity-0"
  }`;
  useEffect(() => {
    if (!wentLive || step !== "confirm") return;
    const done = () => {
      // Fade the QR code, link and End Session in over the Go Live circle.
      setShown(false);
      setStep("share");
      setGoingLive(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    };
    if (ready) return done();
    const t = setTimeout(done, 8000);
    return () => clearTimeout(t);
  }, [wentLive, step, ready]);
  const [copiedShare, setCopiedShare] = useState(false);
  // The phone's own share menu (Messages, WhatsApp...), where there is one.
  const canNativeShare = phone && typeof navigator !== "undefined" && !!navigator.share;
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
  // The download draws from a separate, large canvas (not the 150px one on
  // screen) so the PNG is sharp: 1200px plus a 160px quiet margin.
  const shareQrRef = useRef<HTMLCanvasElement>(null);

  const QR_FG_PRESETS = qrTransparent
    ? // Five presets plus the custom swatch, two rows of three like the others.
      ["#212121", "#F5EFEF", "#2E7299", "#538844", "#E07D31"]
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
    const padding = 160;
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
  // The Go live view (circle, then QR code, link and End Session): beside the
  // phone preview, or on its own where the page has its own preview.
  const liveView = step === "confirm" || wentLive || !!isLive;
  // The two-panel view only with the phone; the presenter (its own preview)
  // gets the single-column dialog for everything.
  const twoPanel = liveView && showPreview && !phone;
  // text-pretty: no word left alone on the last line ("days").
  const NOTE =
    "mono text-pretty text-[10px] uppercase leading-snug tracking-wider text-foreground/80";
  const STAYS_LIVE =
    "This gathering will stay live until you end it or go live on another one. If it's left running, it ends on its own after 14 days.";
  const swatch = (selected: boolean): React.CSSProperties => ({
    borderColor: selected
      ? "var(--foreground)"
      : "color-mix(in srgb, var(--foreground) 20%, transparent)",
  });

  // The QR code with its colours and download, side by side.
  // Drawn (hidden) before the link is known too, so it keeps its size and the
  // whole block appears at once.
  const qrBlock = (
    // The right column is centred on the QR code: colours, then Download PNG
    // a short step below them.
    <div className={phone ? "flex flex-col items-center gap-6" : "flex items-stretch gap-8"}>
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
          value={shareUrl || "https://phyto.live/"}
          size={150}
          fgColor={qrFg}
          bgColor={qrTransparent ? "transparent" : qrBg}
        />
        {/* The download's source, never shown. */}
        <QRCodeCanvas
          ref={shareQrRef}
          value={shareUrl || "https://phyto.live/"}
          size={1200}
          fgColor={qrFg}
          bgColor={qrTransparent ? "transparent" : qrBg}
          className="hidden"
          aria-hidden
        />
      </div>
      {/* As wide as the labels and swatches (not the rest of the row), so
          Download PNG centres under them. */}
      <div className="flex flex-col justify-center gap-4">
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
            <ColorPicker
              value={qrFg}
              onChange={setQrFg}
              trigger={
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 transition"
                  style={{
                    ...swatch(!QR_FG_PRESETS.includes(qrFg)),
                    backgroundColor: QR_FG_PRESETS.includes(qrFg) ? "transparent" : qrFg,
                    color: "var(--foreground)",
                  }}
                  aria-label="Custom dot colour"
                >
                  {QR_FG_PRESETS.includes(qrFg) && <span className="text-xs leading-none">+</span>}
                </button>
              }
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
          className={`mono uppercase mt-2 self-center rounded-full border border-foreground px-4 py-1.5 ${phone ? "text-[10px]" : "text-xs"} tracking-wider transition hover:bg-foreground hover:text-background`}
        >
          Download PNG
        </button>
      </div>
    </div>
  );

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
              className={`mono uppercase flex h-10 items-center rounded-full bg-foreground px-5 ${phone ? "text-[10px]" : "text-xs"} tracking-wider text-background transition hover:opacity-90 disabled:opacity-50`}
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
      {/* One fixed-height row under the bar: Customize link, a save error, or
          empty while editing, so the block never moves. */}
      {editable && (
        <div className="mt-2 flex h-4 items-center justify-center">
          {editingSlug ? (
            slugError && (
              <p className="mono text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
                {slugError}
              </p>
            )
          ) : (
            <button
              type="button"
              onClick={() => setEditingSlug(true)}
              className="mono text-[10px] uppercase tracking-wider text-muted-foreground underline underline-offset-2 transition hover:text-foreground"
            >
              Customize link
            </button>
          )}
        </div>
      )}
    </div>
  );

  // The big red Go Live circle (fills and pulses on hover; pulses while going
  // live). `size` caps its width.
  const goLiveCircle = (size: string) => (
    <button
      type="button"
      onClick={async () => {
        if (!onGoLive) return;
        setGoingLive(true);
        try {
          await onGoLive();
          // The effect above moves on once the link is ready.
          setWentLive(true);
        } catch (err) {
          console.error("Go live failed", err);
          setGoingLive(false);
        }
      }}
      disabled={goingLive}
      className={`mono flex aspect-square w-full ${size} items-center justify-center rounded-full border border-[var(--brand-red)] text-sm uppercase tracking-wider transition-colors hover:animate-pulse hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)] ${
        goingLive
          ? "animate-pulse bg-[var(--brand-red)] text-[var(--brand-white)]"
          : phone
            ? // Phone: no hover to fill it, so it's red from the start.
              "bg-[var(--brand-red)] text-[var(--brand-white)]"
            : "text-[var(--brand-red)]"
      }`}
    >
      {goingLive ? "Going Live..." : "Go Live"}
    </button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (goingLive) return;
        onOpenChange(o);
      }}
    >
      {phone ? (
        // Full screen. Go live: the circle in the middle of the screen. Live or
        // Share: Share link, the link bar, then the QR code and its colours.
        <DialogContent
          className="left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))] data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {liveView ? `Share ${gatheringName}` : "Share your link"}
          </DialogTitle>
          {step === "confirm" ? (
            <div className="flex flex-1 items-center justify-center">
              {goLiveCircle("max-w-[16rem]")}
            </div>
          ) : (
            <div className={`flex-1 ${reveal}`}>
              {/* Share link (the phone's share sheet) and Visit link (opens it). */}
              <div className="mb-4 flex gap-2">
                {canNativeShare && (
                  <button
                    type="button"
                    disabled={!shareUrl}
                    onClick={() => {
                      navigator.share({ title: gatheringName, url: shareUrl }).catch(() => {});
                    }}
                    className="mono flex-1 rounded-full bg-foreground py-3 text-xs uppercase tracking-wider text-background transition active:opacity-80 disabled:opacity-40"
                  >
                    Share link
                  </button>
                )}
                <a
                  href={shareUrl || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!shareUrl}
                  className={`mono flex-1 rounded-full border border-foreground py-3 text-center text-xs uppercase tracking-wider transition active:bg-foreground active:text-background ${shareUrl ? "" : "pointer-events-none opacity-40"}`}
                >
                  Visit link
                </a>
              </div>
              {linkBlock}
              <div className="mt-10">{qrBlock}</div>
            </div>
          )}
          <p className="mono mt-8 w-full text-[10px] uppercase leading-snug tracking-wider text-foreground/80">
            {liveView
              ? STAYS_LIVE
              : "Whatever gathering goes live will be accessible at this link."}
          </p>
          {/* No End Session here: the red live button on the card ends it. */}
        </DialogContent>
      ) : twoPanel ? (
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
                    {goLiveCircle("max-w-[24.5rem]")}
                  </div>
                </>
              ) : (
                // The QR code and link sit midway down, between the top and the note.
                <div className={`flex flex-1 flex-col justify-center pb-12 ${reveal}`}>
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
                  className={`mono mt-12 w-full rounded-full border border-[var(--brand-red)] py-4 text-xs uppercase tracking-wider text-[var(--brand-red)] transition hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)] ${reveal}`}
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
        // Hugs its content (the QR row and link bar): no spare width on the right.
        <DialogContent
          className="w-fit max-w-[calc(100vw-2rem)] gap-0 rounded-3xl p-8"
          aria-describedby={undefined}
        >
          {/* Single column: Share with nothing live, and everything in the
              presenter (Go live, then the same view as its Share). */}
          <DialogTitle className="pr-8 text-2xl font-normal leading-tight">
            {liveView ? `Share ${gatheringName} to your friends!` : "Share your link!"}
          </DialogTitle>
          {step === "confirm" ? (
            // The Go Live circle, the note right under it.
            <div className="mt-8 flex justify-center">{goLiveCircle("max-w-[15rem]")}</div>
          ) : (
            // As wide as the QR code and its colours, so the link bar ends
            // under the last swatch instead of running past it.
            <div className={`w-fit ${reveal}`}>
              <div className="mt-8">{qrBlock}</div>
              <div className="mt-14">{linkBlock}</div>
            </div>
          )}
          {/* Wraps to the content's width rather than widening the dialog. */}
          <p className={`${NOTE} mt-8 w-0 min-w-full`}>
            {liveView
              ? STAYS_LIVE
              : "Whatever gathering goes live will be accessible at this link."}
          </p>
        </DialogContent>
      )}
    </Dialog>
  );
}
