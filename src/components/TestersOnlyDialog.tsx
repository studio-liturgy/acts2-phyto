import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PROD_ORIGIN } from "@/lib/testers";

/** phytoexp.live only: shown to an email that isn't on the tester list. */
export function TestersOnlyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="gap-0 rounded-3xl p-8">
        <AlertDialogTitle className="text-2xl font-normal leading-tight">
          Testers only
        </AlertDialogTitle>
        <AlertDialogDescription className="mt-4 text-base text-foreground text-pretty">
          phytoexp is open to invited testers. Use phyto.live to keep working with your account.
        </AlertDialogDescription>
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => {
              window.location.href = PROD_ORIGIN;
            }}
            className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
          >
            Go to phyto.live
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
