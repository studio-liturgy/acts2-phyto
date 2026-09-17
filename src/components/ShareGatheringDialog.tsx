import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { normalizeSlug, slugErrorMessage, validateSlug, type SlugError } from "@/lib/slug";

type SlugSaveResult = { ok: true } | { ok: false; reason: SlugError | "taken" | "offline" };

/**
 * Share-a-gathering dialog: copyable link plus an optional, fully customizable QR
 * code (dot/background colours, transparent background, padded PNG download).
 * Shared by the home catalogue (`GatheringCard`) and the presenter top bar so the
 * two stay in lockstep. `showShareQr` resets on close so the QR starts collapsed
 * each time the dialog is reopened.
 */
export function ShareGatheringDialog({
  open,
  onOpenChange,
  shareUrl,
  gatheringName,
  isLive,
  slug,
  onSlugSave,
}: {
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
  const [showShareQr, setShowShareQr] = useState(false);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setShowShareQr(false);
        onOpenChange(o);
      }}
    >
      <DialogContent className="gap-0 rounded-3xl p-8" aria-describedby={undefined}>
        <DialogTitle className="text-2xl font-normal leading-tight">Share your link!</DialogTitle>

        <div className="mt-6 flex items-center gap-2">
          <div className="flex flex-1 items-center overflow-hidden rounded-full border border-foreground">
            {editingSlug ? (
              <>
                <span className="pl-4 font-mono uppercase text-sm text-muted-foreground">/g/</span>
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
                <span className="flex-1 truncate px-4 font-mono uppercase text-sm text-muted-foreground">
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    setCopiedShare(true);
                    setTimeout(() => setCopiedShare(false), 2000);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90"
                  aria-label="Copy URL"
                >
                  <span className="transition-all duration-300">
                    {copiedShare ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </span>
                </button>
              </>
            )}
          </div>
          {!editingSlug && (
            <button
              type="button"
              onClick={() => setShowShareQr((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90"
              aria-label="QR Code"
            >
              <QrCode className="h-4 w-4" />
            </button>
          )}
        </div>

        {editable && editingSlug && slugError && (
          <p className="mono mt-2 px-4 text-[10px] uppercase tracking-wider text-destructive">
            {slugError}
          </p>
        )}

        {showShareQr && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div
              className="rounded-xl p-4"
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
                size={180}
                fgColor={qrFg}
                bgColor={qrTransparent ? "transparent" : qrBg}
              />
            </div>
            <div className="flex flex-col gap-2 self-stretch">
              <div className="flex items-center gap-3">
                <span className="w-28 font-mono text-xs uppercase text-foreground">Dots</span>
                <div className="flex gap-1.5">
                  {QR_FG_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setQrFg(c)}
                      className="h-7 w-7 rounded-full border-2 transition"
                      style={{
                        backgroundColor: c,
                        borderColor:
                          qrFg === c
                            ? "var(--foreground)"
                            : "color-mix(in srgb, var(--foreground) 20%, transparent)",
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => qrFgCustomRef.current?.click()}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition"
                    style={{
                      borderColor: "color-mix(in srgb, var(--foreground) 20%, transparent)",
                      backgroundColor: QR_FG_PRESETS.includes(qrFg) ? "transparent" : qrFg,
                      color: "var(--foreground)",
                    }}
                  >
                    {QR_FG_PRESETS.includes(qrFg) && (
                      <span className="text-sm leading-none">+</span>
                    )}
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
              <div className="flex items-center gap-3">
                <span className="w-28 font-mono text-xs uppercase text-foreground">Background</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQrBackground("#000000")}
                    className="h-7 w-7 rounded-full border-2 transition"
                    style={{
                      backgroundColor: "#000000",
                      borderColor:
                        !qrTransparent && qrBg === "#000000"
                          ? "var(--foreground)"
                          : "color-mix(in srgb, var(--foreground) 20%, transparent)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setQrBackground("#ffffff")}
                    className="h-7 w-7 rounded-full border-2 transition"
                    style={{
                      backgroundColor: "#ffffff",
                      borderColor:
                        !qrTransparent && qrBg === "#ffffff"
                          ? "var(--foreground)"
                          : "color-mix(in srgb, var(--foreground) 20%, transparent)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setQrBackground(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition overflow-hidden"
                    style={{
                      borderColor: qrTransparent
                        ? "var(--foreground)"
                        : "color-mix(in srgb, var(--foreground) 20%, transparent)",
                      padding: 0,
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" style={{ display: "block" }}>
                      <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="#212121" />
                      <path d="M12 22 A10 10 0 0 1 12 2 Z" fill="#F5EFEF" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => downloadQr(`${gatheringName}-qr.png`)}
              className="mono uppercase rounded-full border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
            >
              Download
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col items-start gap-2">
          {isLive ? (
            <p className="mono uppercase text-[10px] tracking-wider text-muted-foreground">
              Sharing <span className="text-foreground">{gatheringName}</span>, live now.
            </p>
          ) : (
            <p className="mono uppercase text-[10px] tracking-wider text-muted-foreground">
              Whatever gathering goes live will be accessible at this link.
            </p>
          )}
          {editable && !editingSlug && (
            <button
              type="button"
              onClick={() => setEditingSlug(true)}
              className="mono text-[10px] uppercase tracking-wider text-muted-foreground underline underline-offset-2 transition hover:text-foreground"
            >
              Customize link
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
