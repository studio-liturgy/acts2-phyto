import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

const isTest = import.meta.env.VITE_APP_ENV === "test";
const STORAGE_KEY = "phyto-test-warning-v1";
const WARN_AFTER_MS = 24 * 60 * 60 * 1000;

function readLastVisit(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function recordVisit(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {}
}

export function TestSiteWarning() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isTest) return;
    const lastVisit = readLastVisit();
    if (!lastVisit || Date.now() - lastVisit > WARN_AFTER_MS) {
      setOpen(true);
    }
    // Measure the 24h window from the last visit, whether or not we warned.
    recordVisit();
  }, []);

  if (!isTest) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="gap-0 rounded-3xl p-8">
        <AlertDialogTitle className="mono uppercase text-2xl font-normal leading-tight">
          Warning
        </AlertDialogTitle>
        <AlertDialogDescription className="mt-4 text-base text-foreground">
          This is an experimental testing environment for phyto. You’re likely to encounter bugs in this version.
        </AlertDialogDescription>
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => setOpen(false)}
            className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90"
          >
            Continue
          </button>
          <button
            onClick={() => {
              window.location.href = "https://phyto.live";
            }}
            className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
          >
            phyto.live
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
