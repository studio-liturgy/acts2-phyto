import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNativeApp } from "@/hooks/use-native-app";
import { chooseNoAccount } from "@/lib/no-account";
import { NO_ACCOUNT_NOTICE } from "@/lib/account-notes";

/**
 * The app landing's second option, under Sign In: "Use without an account",
 * then a one-time notice (a copy of the "End this session?" dialog) before
 * the library opens. Renders nothing outside the phyto app.
 */
export function NoAccountChoice() {
  const nativeApp = useNativeApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!nativeApp) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mono uppercase px-6 py-2 text-xs tracking-wider text-foreground/60 transition hover:text-foreground"
      >
        Use without an account
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="gap-0 rounded-3xl p-8">
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
                setOpen(false);
                chooseNoAccount();
                navigate({ to: "/", search: {} });
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
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
