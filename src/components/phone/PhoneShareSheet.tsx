import { useAccountSlug } from "@/hooks/use-account-slug";
import { liveLinkUrl } from "@/lib/testers";
import { ShareGatheringDialog } from "@/components/ShareGatheringDialog";
import { useSessionLost } from "@/lib/session-lost";
import { useIsSignedIn } from "@/lib/authStore";
import { isLiveNow } from "@/lib/live-session";
import { useLibrary } from "@/lib/store";

/**
 * Go live / Share for one gathering on the phone: the desktop dialog's flow
 * (Go Live circle, then QR code and link) as a full-screen sheet. `step`
 * "confirm" opens on the Go Live circle, "share" on the link.
 */
export function PhoneShareSheet({
  gatheringId,
  step,
  onClose,
}: {
  gatheringId: string;
  step: "confirm" | "share" | null;
  onClose: () => void;
}) {
  const g = useLibrary((s) => s.gatherings[gatheringId]);
  const goLive = useLibrary((s) => s.goLive);
  const endSession = useLibrary((s) => s.endSession);
  const isSignedIn = useIsSignedIn();
  const open = step !== null;
  const share = useAccountSlug({
    scope: { groupId: g?.group_id ?? null },
    seed: g?.share_token ?? "",
    enabled: open,
  });
  if (!g) return null;
  const isLive = g.is_live === null ? null : isLiveNow(g);
  return (
    <ShareGatheringDialog
      phone
      showPreview={false}
      open={open}
      onOpenChange={(o) => !o && onClose()}
      step={step ?? "share"}
      onGoLive={async () => {
        if (!isSignedIn) {
          onClose();
          useSessionLost.getState().prompt();
          return;
        }
        await goLive(gatheringId);
      }}
      onEndSession={() => void endSession(gatheringId)}
      gatheringId={gatheringId}
      shareUrl={share.slug ? liveLinkUrl(share.slug) : ""}
      gatheringName={g.name}
      isLive={isLive}
      slug={share.slug}
      onSlugSave={!g.shared && share.canCustomize ? share.save : undefined}
    />
  );
}
