import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
  gatheringName: string;
  isLive: boolean | null;
}) {
  const [showShareQr, setShowShareQr] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
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
        <DialogTitle className="text-2xl font-normal leading-tight">
          Share this gathering!
        </DialogTitle>

        <div className="mt-6 flex items-center gap-2">
          <div className="flex flex-1 items-center overflow-hidden rounded-full border border-foreground">
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

        {!isLive && (
          <p className="mono uppercase mt-6 text-xs tracking-wider text-muted-foreground">
            Once live, this gathering will be accessible via this link.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
