import { create } from "zustand";
import { useEffect, useState } from "react";

export type SyncState = "synced" | "syncing" | "offline";

interface SyncStatusStore {
  status: SyncState;
  setStatus: (status: SyncState) => void;
}

export const useSyncStatusStore = create<SyncStatusStore>((set) => ({
  status: "synced",
  setStatus: (status) => set({ status }),
}));

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
