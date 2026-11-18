import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNativeApp } from "@/hooks/use-native-app";
import { chooseNoAccount } from "@/lib/no-account";
import { NO_ACCOUNT_NOTICE, NO_ACCOUNT_WARNING } from "@/lib/account-notes";

/**
 * The app landing's second option, under Sign In: "Use without an account",
 * then a one-time notice (a copy of the "End this session?" dialog) before
 * the library opens. Renders nothing outside the phyto app.
 */
export function NoAccountChoice({ className }: { className?: string } = {}) {
  const nativeApp = useNativeApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Continue only closes the notice; the library opens once the close has
  // finished. Switching screens mid-close unmounted this dialog before Radix
  // could hand taps back to the page (body stays pointer-events: none), so
  // nothing on the next screen answered a tap.
  const continuing = useRef(false);
  if (!nativeApp) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "mono uppercase px-6 py-2 text-xs tracking-wider text-foreground/60 transition hover:text-foreground"
        }
      >
        Use without an account
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent
          className="gap-0 rounded-3xl p-8"
          onCloseAutoFocus={(e) => {
            if (!continuing.current) return;
            continuing.current = false;
            e.preventDefault();
            setTimeout(() => {
              document.body.style.pointerEvents = "";
              chooseNoAccount();
              navigate({ to: "/", search: {} });
            }, 0);
          }}
        >
          <AlertDialogTitle className="text-2xl font-normal leading-tight">
            Use without an account?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-4 text-base text-foreground">
            {NO_ACCOUNT_NOTICE}
          </AlertDialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                continuing.current = true;
                setOpen(false);
              }}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm"
            >
              Back
            </button>
          </div>
          <p className="mono mt-4 text-center text-[10px] uppercase tracking-wider text-[var(--brand-red)]">
            {NO_ACCOUNT_WARNING}
          </p>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
