import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSessionLost } from "@/lib/session-lost";

/** Shown when the login expired and couldn't be renewed (see lib/session-lost).
 *  Edits stay on this device; signing in again syncs them. Not shown on the
 *  login-free phone viewer or the output window. */
export function SignedOutDialog() {
  const { pathname, searchStr } = useLocation();
  const navigate = useNavigate();
  const open = useSessionLost((s) => s.dialogOpen);
  const close = useSessionLost((s) => s.close);
  const hidden = pathname.startsWith("/g/") || pathname === "/output" || pathname === "/login";

  return (
    <AlertDialog open={open && !hidden} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent className="gap-0 rounded-3xl p-8">
        <AlertDialogTitle className="text-2xl font-normal leading-tight">
          You've been signed out
        </AlertDialogTitle>
        <AlertDialogDescription className="mt-4 text-base text-foreground text-pretty">
          Sign in again to sync your edits and adjust live gatherings.
        </AlertDialogDescription>
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => {
              close();
              navigate({ to: "/login", search: { next: pathname + (searchStr ?? "") } });
            }}
            className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={close}
            className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
          >
            Later
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
