import { useEffect, useSyncExternalStore } from "react";
import { loadYvNames, subscribeYvNames, yvNamesLoaded } from "@/lib/youversion";

/** Loads YouVersion's Bible titles and language names (for a version picker
 *  or the Terms page) and re-renders once they're in. True when loaded. */
export function useYvNames(): boolean {
  useEffect(() => {
    void loadYvNames();
  }, []);
  return useSyncExternalStore(subscribeYvNames, yvNamesLoaded, () => false);
}
