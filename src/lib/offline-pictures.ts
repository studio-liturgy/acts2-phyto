// Pictures kept on the phone (phyto app only). Every picture the library can
// show (image slides, the backdrop, YouTube posters) is sent to the app's
// offline cache (public/sw.js), which keeps a copy and drops pictures no set
// uses any more, so slides draw without the network. Videos are not kept.

import { liveQuery } from "dexie";
import { db } from "./db";
import { MEDIA_HOSTS } from "./gathering-export";
import { setsMedia } from "./media-preload";
import { useLibrary } from "./store";
import type { Background, Set as PhytoSet } from "./types";

/** The message the offline cache listens for (public/sw.js). */
export const SW_PICTURES_MESSAGE = "phyto-sw-pictures";

/** Hosts whose pictures the offline cache keeps: our R2 media and YouTube's
 *  posters. Inline (data URL) pictures are inside the set already. */
export const PICTURE_HOSTS = [...MEDIA_HOSTS, "i.ytimg.com"];

export function isKeptPicture(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PICTURE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Every picture in the library worth keeping on the phone, sorted, no repeats. */
export function libraryPictureUrls(
  sets: (PhytoSet | undefined)[],
  background?: Background,
): string[] {
  return setsMedia(sets, background).images.filter(isKeptPicture).sort();
}

/** Inside the app: keeps the offline cache's picture list in step with the
 *  library (on launch and whenever a set or the backdrop changes). Returns a
 *  stop function. */
export function watchLibraryPictures(delayMs = 2000): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  let sets: PhytoSet[] | null = null;
  let sent = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!sets) return;
      const urls = libraryPictureUrls(sets, useLibrary.getState().background);
      const key = urls.join("\n");
      if (key === sent) return;
      void navigator.serviceWorker.ready
        .then((reg) => {
          reg.active?.postMessage({ type: SW_PICTURES_MESSAGE, urls });
          sent = key;
        })
        .catch(() => {});
    }, delayMs);
  };
  const sub = liveQuery(() => db.sets.toArray()).subscribe({
    next: (rows) => {
      sets = rows;
      schedule();
    },
    error: () => {},
  });
  const unsubStore = useLibrary.subscribe((s, prev) => {
    if (s.background !== prev.background) schedule();
  });
  return () => {
    clearTimeout(timer);
    sub.unsubscribe();
    unsubStore();
  };
}
