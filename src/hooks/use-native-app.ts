import { useLayoutEffect, useState } from "react";
import { nativePlatform, type NativePlatform } from "@/lib/native-app";

/** The phyto app's platform, or null in a browser. Null during SSR and the
 *  first client render (so hydration matches), then read before paint. */
export function useNativeApp(): NativePlatform | null {
  const [platform, setPlatform] = useState<NativePlatform | null>(null);
  useLayoutEffect(() => setPlatform(nativePlatform()), []);
  return platform;
}
