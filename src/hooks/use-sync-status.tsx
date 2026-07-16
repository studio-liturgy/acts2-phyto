import { create } from "zustand";
import { useEffect, useState } from "react";

export type SyncState = "synced" | "syncing" | "offline";

/** Progress of an account pull (the post-login diff + merge pass).
 *  `total` is 0 until the fetch knows how many sets need downloading. */
export type PullProgress = { done: number; total: number };

interface SyncStatusStore {
  status: SyncState;
  setStatus: (status: SyncState) => void;
  /** Non-null while the signed-in account pull is running. Lifecycle is owned
   *  by runDiff in __root.tsx (set on entry, cleared in finally); fetchRemote
   *  only reports numbers INTO an already-active pull, so other fetch callers
   *  can never strand a non-null pull that nobody clears. */
  pull: PullProgress | null;
  setPull: (pull: PullProgress | null) => void;
}

export const useSyncStatusStore = create<SyncStatusStore>((set) => ({
  status: "synced",
  setStatus: (status) => set({ status }),
  pull: null,
  setPull: (pull) => set({ pull }),
}));

/** The in-flight account pull, or null when none is running. */
export function useAccountPull(): PullProgress | null {
  return useSyncStatusStore((s) => s.pull);
}

export function useSyncStatus(): SyncState {
  const storeStatus = useSyncStatusStore((s) => s.status);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!isOnline) return "offline";
  return storeStatus;
}
