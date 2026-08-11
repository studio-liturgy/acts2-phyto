import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Set as PhytoSet, Slide, LiveState, Gathering, SetTemplate } from "./types";
import { db } from "./db";
import { liveQuery } from "dexie";
import { supabase } from "./supabase";
import { useAuthStore } from "./authStore";
import { pushToSupabase, recordDeletions, withSyncLock } from "./sync";
import { isLiveNow, type LiveWindow } from "./live-session";
import { isInlineImage } from "./image-upload";
import { hasInlineImages, migrateSetImagesToR2 } from "./migrate-images";

function uid() {
  return crypto.randomUUID();
}

// Shared slide-template defaults. Spread these (`{ ...DEFAULT_* }`) so each caller
// gets a fresh object and never mutates the shared constant.
const SLIDE_FONT_STACK = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const DEFAULT_SONG_TEMPLATE: SetTemplate = {
  fontScale: 1,
  fontFamily: SLIDE_FONT_STACK,
  bg: "black",
  position: "centre",
};
const DEFAULT_SCRIPTURE_TEMPLATE: SetTemplate = {
  fontScale: 1,
  fontFamily: SLIDE_FONT_STACK,
  bg: "black",
  align: "left",
  referencePosition: "below",
};

// --- Song template persistence + cross-window sync ---
const TEMPLATE_KEY = "song-template-v1";

function readSongTemplate(): SetTemplate {
  if (typeof window === "undefined") return { ...DEFAULT_SONG_TEMPLATE };
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ...DEFAULT_SONG_TEMPLATE };
}

// --- Scripture template persistence + cross-window sync ---
const SCRIPTURE_TEMPLATE_KEY = "scripture-template-v1";

// --- Global fade duration persistence + cross-window sync ---
const FADE_KEY = "fade-ms-v1";

function readFadeMs(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(FADE_KEY);
    if (raw) return Number(raw);
  } catch {}
  return 0;
}

function readScriptureTemplate(): SetTemplate {
  if (typeof window === "undefined") return { ...DEFAULT_SCRIPTURE_TEMPLATE };
  try {
    const raw = localStorage.getItem(SCRIPTURE_TEMPLATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ...DEFAULT_SCRIPTURE_TEMPLATE };
}

// Debounce pushToSupabase so rapid consecutive mutations fire only one push,
// and accumulate WHICH rows changed so the push uploads only those — work that
// scales with the number of edits, not the size of the library. Cross-tab store
// consistency is handled reactively by the Dexie `liveQuery` subscription at the
// bottom of this file (every tab re-derives its store from Dexie on any write),
// so no bespoke broadcast plumbing is needed here.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const dirtySetIds = new Set<string>();
const dirtyGatheringIds = new Set<string>();
function schedulePush(opts?: { set?: string; gathering?: string }) {
  if (opts?.set) dirtySetIds.add(opts.set);
  if (opts?.gathering) dirtyGatheringIds.add(opts.gathering);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const setIds = [...dirtySetIds];
    const gatheringIds = [...dirtyGatheringIds];
    dirtySetIds.clear();
    dirtyGatheringIds.clear();
    pushToSupabase({ setIds, gatheringIds }).then((ok) => {
      if (ok) return;
      // Push failed (e.g. offline). Re-mark the rows dirty and reschedule so the
      // change isn't lost; the load-time diff is the cross-session safety net.
      setIds.forEach((id) => dirtySetIds.add(id));
      gatheringIds.forEach((id) => dirtyGatheringIds.add(id));
      schedulePush();
    });
  }, 500);
}

// Best-effort cleanup of R2-hosted uploads when their slides go away. Only
// `videoSource === "file"` videos and non-inline images own an R2 object
// (youtube/url videos and `data:` images just reference something else).
// Fired and forgotten: a failed delete leaves an orphan but never blocks or
// breaks the local edit. The server re-validates that the object belongs to
// the caller before deleting, and ignores anything outside its own bucket.
function purgeUploadedMedia(slides: Slide[]): void {
  const videoUrls = slides
    .filter((sl) => sl.kind === "video" && sl.videoSource === "file" && sl.videoUrl)
    .map((sl) => sl.videoUrl as string);
  const imageUrls = slides
    .filter((sl) => sl.imageUrl && !isInlineImage(sl.imageUrl))
    .map((sl) => sl.imageUrl as string);
  const urls = [...videoUrls, ...imageUrls];
  if (urls.length === 0) return;
  const token = useAuthStore.getState().session?.access_token;
  if (!token) return;
  for (const url of urls) {
    fetch("/api/media/upload", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => {
      // Orphaned object; the quota check is the backstop. Nothing to do.
    });
  }
}

/**
 * Pure derivation of the library store shape from raw Dexie rows. Shared by
 * `loadFromDb` and the cross-tab `liveQuery` subscription so both produce an
 * identical store, sorted newest-first by `createdAt`.
 */
function buildLibraryState(allSets: PhytoSet[], allGatherings: Gathering[]) {
  const sets: Record<string, PhytoSet> = {};
  const order: string[] = [];
  for (const s of allSets) {
    sets[s.id] = s;
    order.push(s.id);
  }
  order.sort((a, b) => (sets[b].createdAt ?? 0) - (sets[a].createdAt ?? 0));

  const gatherings: Record<string, Gathering> = {};
  const gatheringOrder: string[] = [];
  for (const p of allGatherings) {
    gatherings[p.id] = p;
    gatheringOrder.push(p.id);
  }
  gatheringOrder.sort((a, b) => (gatherings[b].createdAt ?? 0) - (gatherings[a].createdAt ?? 0));

  return { sets, order, gatherings, gatheringOrder };
}

interface LibraryState {
  sets: Record<string, PhytoSet>;
  order: string[];
  gatherings: Record<string, Gathering>;
  gatheringOrder: string[];
  /** Global template applied to ALL song sets. */
  songTemplate: SetTemplate;
  setSongTemplate: (patch: SetTemplate) => void;
  /** Global template applied to ALL scripture sets. */
  scriptureTemplate: SetTemplate;
  setScriptureTemplate: (patch: SetTemplate) => void;
  /** Global slide crossfade duration in milliseconds (applies to all set types). */
  fadeMs: number;
  setFadeMs: (ms: number) => void;
  createSet: (set: Omit<PhytoSet, "id" | "createdAt" | "updatedAt">) => string;
  updateSet: (id: string, patch: Partial<PhytoSet>) => void;
  deleteSet: (id: string) => void;
  /** Delete several sets in a single batch (one state update + one Supabase
   *  round-trip) so the catalogue doesn't visibly drain one row at a time. */
  deleteSets: (ids: string[]) => Promise<void>;
  addSlide: (setId: string, slide: Omit<Slide, "id">) => string;
  updateSlide: (setId: string, slideId: string, patch: Partial<Slide>) => void;
  removeSlide: (setId: string, slideId: string) => void;
  reorderSlides: (setId: string, ids: string[]) => void;
  createGathering: (name: string) => string;
  renameGathering: (id: string, name: string) => void;
  deleteGathering: (id: string) => void;
  addSetToGathering: (gatheringId: string, setId: string) => void;
  removeSetFromGathering: (gatheringId: string, setIdOrIndex: string | number) => void;
  reorderGatheringSets: (gatheringId: string, setIds: string[]) => void;
  /** Set this gathering live (and take all others offline). Supabase is the
   *  source of truth; Dexie/Zustand are updated to reflect it. */
  goLive: (gatheringId: string) => Promise<void>;
  /** End the live session for this gathering. Supabase is the source of truth. */
  endSession: (gatheringId: string) => Promise<void>;
  /** Hydrate local `is_live` from Supabase (the source of truth). Call on
   *  login / session restore. No-op when signed out. */
  refreshLiveState: () => Promise<void>;
  /** Null out local `is_live` for all gatherings. Call on logout — no local
   *  truth is held while signed out. */
  nullLocalLiveState: () => Promise<void>;
  /** Populate store from Dexie — call once on app mount. */
  loadFromDb: () => Promise<void>;
  /** Hoist legacy inline base64 slide images into R2, one set at a time.
   *  Idempotent, resumable, and a no-op when signed out or already clean. */
  migrateInlineImages: () => Promise<void>;
}

// Guards against a second migration pass starting while one is in flight (the
// effect that calls it re-runs whenever the session or sync dialog changes).
let imageMigrationRunning = false;

export const useLibrary = create<LibraryState>()((set, get) => ({
  sets: {},
  order: [],
  gatherings: {},
  gatheringOrder: [],
  songTemplate: typeof window !== "undefined" ? readSongTemplate() : { ...DEFAULT_SONG_TEMPLATE },
  scriptureTemplate:
    typeof window !== "undefined" ? readScriptureTemplate() : { ...DEFAULT_SCRIPTURE_TEMPLATE },
  fadeMs: typeof window !== "undefined" ? readFadeMs() : 0,

  loadFromDb: async () => {
    const [allSets, allGatherings] = await Promise.all([
      db.sets.toArray(),
      db.gatherings.toArray(),
    ]);
    set(buildLibraryState(allSets, allGatherings));
  },

  migrateInlineImages: async () => {
    if (imageMigrationRunning) return;
    if (!useAuthStore.getState().session) return;
    imageMigrationRunning = true;
    try {
      // Snapshot the ids up front — updateSet below rewrites the store as we go.
      const pending = Object.values(get().sets)
        .filter((s) => hasInlineImages(s.slides))
        .map((s) => s.id);

      for (const id of pending) {
        // Signing out mid-pass drops the upload token; stop rather than churn
        // through sets that can only fail.
        if (!useAuthStore.getState().session) break;
        // Re-read: a merge may have replaced or removed this set since the snapshot.
        const current = get().sets[id];
        if (!current || !hasInlineImages(current.slides)) continue;

        const { slides, moved } = await migrateSetImagesToR2(current.slides);
        // Any slide that failed to upload keeps its data URL and is picked up
        // by the next pass, so a partial result is still worth persisting.
        if (moved > 0) get().updateSet(id, { slides });
      }
    } finally {
      imageMigrationRunning = false;
    }
  },

  setSongTemplate: (patch) =>
    set((s) => {
      const next = { ...s.songTemplate, ...patch };
      try {
        localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
        new BroadcastChannel(TEMPLATE_KEY).postMessage(next);
      } catch {}
      return { songTemplate: next };
    }),

  setScriptureTemplate: (patch) =>
    set((s) => {
      const next = { ...s.scriptureTemplate, ...patch };
      try {
        localStorage.setItem(SCRIPTURE_TEMPLATE_KEY, JSON.stringify(next));
        new BroadcastChannel(SCRIPTURE_TEMPLATE_KEY).postMessage(next);
      } catch {}
      return { scriptureTemplate: next };
    }),

  setFadeMs: (ms) =>
    set(() => {
      try {
        localStorage.setItem(FADE_KEY, String(ms));
        new BroadcastChannel(FADE_KEY).postMessage(ms);
      } catch {}
      return { fadeMs: ms };
    }),

  createSet: (newSet) => {
    const id = uid();
    const now = Date.now();
    const record: PhytoSet = { ...newSet, id, createdAt: now, updatedAt: now };
    set((s) => ({
      sets: { ...s.sets, [id]: record },
      order: [id, ...s.order],
    }));
    db.sets.put(record).then(() => schedulePush({ set: id }));
    return id;
  },

  updateSet: (id, patch) =>
    set((s) => {
      const d = s.sets[id];
      if (!d) return s;
      const updated = { ...d, ...patch, updatedAt: Date.now() };
      db.sets.put(updated).then(() => schedulePush({ set: id }));
      // Keep live slideId at same position index when slides are regenerated.
      if (patch.slides) {
        const live = useLive.getState();
        if (live.setId === id && !patch.slides.find((sl) => sl.id === live.slideId)) {
          const oldIdx = d.slides.findIndex((sl) => sl.id === live.slideId);
          const newSlide = patch.slides[Math.min(Math.max(oldIdx, 0), patch.slides.length - 1)];
          if (newSlide) useLive.getState().setLive({ slideId: newSlide.id });
        }
      }
      return { sets: { ...s.sets, [id]: updated } };
    }),

  deleteSet: async (id) => {
    // Serialize against pushes/merges under the shared sync lock so an in-flight
    // push (holding a pre-delete Dexie snapshot) can't re-upsert this row.
    await withSyncLock(async () => {
      const removedSlides = get().sets[id]?.slides ?? [];
      const session = useAuthStore.getState().session;
      if (session) {
        const { error } = await supabase
          .from("sets")
          .delete()
          .eq("id", id)
          .eq("user_id", session.user.id);
        if (error) console.error("[deleteSet] Supabase delete error:", error);
        // Tombstone so other devices holding a copy delete it instead of
        // pushing it back (sync.ts remotelyDeleted).
        await recordDeletions("set", [id]);
      }
      await db.sets.delete(id);
      purgeUploadedMedia(removedSlides);
      set((s) => {
        const { [id]: _gone, ...rest } = s.sets;
        return { sets: rest, order: s.order.filter((x) => x !== id) };
      });
      // Remove deleted set from all gatherings to avoid FK violations on next push
      const gatherings = get().gatherings;
      const toUpdate: Gathering[] = [];
      for (const p of Object.values(gatherings)) {
        if (p.setIds.includes(id)) {
          toUpdate.push({ ...p, setIds: p.setIds.filter((s) => s !== id), updatedAt: Date.now() });
        }
      }
      if (toUpdate.length) {
        await Promise.all(toUpdate.map((p) => db.gatherings.put(p)));
        set((s) => ({
          gatherings: { ...s.gatherings, ...Object.fromEntries(toUpdate.map((p) => [p.id, p])) },
        }));
        for (const p of toUpdate) schedulePush({ gathering: p.id });
      }
    });
  },

  deleteSets: async (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    await withSyncLock(async () => {
      const current = get().sets;
      const removedSlides = ids.flatMap((id) => current[id]?.slides ?? []);
      const session = useAuthStore.getState().session;
      if (session) {
        const { error } = await supabase
          .from("sets")
          .delete()
          .in("id", [...idSet])
          .eq("user_id", session.user.id);
        if (error) console.error("[deleteSets] Supabase delete error:", error);
        // Tombstones so other devices holding copies delete them instead of
        // pushing them back (sync.ts remotelyDeleted).
        await recordDeletions("set", [...idSet]);
      }
      await db.sets.bulkDelete([...idSet]);
      purgeUploadedMedia(removedSlides);
      set((s) => {
        const rest = { ...s.sets };
        for (const id of idSet) delete rest[id];
        return { sets: rest, order: s.order.filter((x) => !idSet.has(x)) };
      });
      // Drop the deleted sets from every gathering to avoid FK violations on push.
      const gatherings = get().gatherings;
      const toUpdate: Gathering[] = [];
      for (const p of Object.values(gatherings)) {
        if (p.setIds.some((sid) => idSet.has(sid))) {
          toUpdate.push({
            ...p,
            setIds: p.setIds.filter((sid) => !idSet.has(sid)),
            updatedAt: Date.now(),
          });
        }
      }
      if (toUpdate.length) {
        await Promise.all(toUpdate.map((p) => db.gatherings.put(p)));
        set((s) => ({
          gatherings: { ...s.gatherings, ...Object.fromEntries(toUpdate.map((p) => [p.id, p])) },
        }));
        for (const p of toUpdate) schedulePush({ gathering: p.id });
      }
    });
  },

  addSlide: (setId, slide) => {
    const id = uid();
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const updated = { ...d, slides: [...d.slides, { ...slide, id }], updatedAt: Date.now() };
      db.sets.put(updated).then(() => schedulePush({ set: setId }));
      return { sets: { ...s.sets, [setId]: updated } };
    });
    return id;
  },

  updateSlide: (setId, slideId, patch) =>
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const updated = {
        ...d,
        slides: d.slides.map((sl) => (sl.id === slideId ? { ...sl, ...patch } : sl)),
        updatedAt: Date.now(),
      };
      db.sets.put(updated).then(() => schedulePush({ set: setId }));
      return { sets: { ...s.sets, [setId]: updated } };
    }),

  removeSlide: (setId, slideId) =>
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const removed = d.slides.find((sl) => sl.id === slideId);
      const updated = {
        ...d,
        slides: d.slides.filter((sl) => sl.id !== slideId),
        updatedAt: Date.now(),
      };
      db.sets.put(updated).then(() => schedulePush({ set: setId }));
      if (removed) purgeUploadedMedia([removed]);
      return { sets: { ...s.sets, [setId]: updated } };
    }),

  reorderSlides: (setId, ids) =>
    set((s) => {
      const d = s.sets[setId];
      if (!d) return s;
      const map = new Map(d.slides.map((sl) => [sl.id, sl]));
      const slides = ids.map((i) => map.get(i)!).filter(Boolean);
      const updated = { ...d, slides, updatedAt: Date.now() };
      db.sets.put(updated).then(() => schedulePush({ set: setId }));
      return { sets: { ...s.sets, [setId]: updated } };
    }),

  createGathering: (name) => {
    const id = uid();
    const now = Date.now();
    const record: Gathering = {
      id,
      name,
      setIds: [],
      share_token: nanoid(10),
      is_live: false,
      live_started_at: null,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      gatherings: { ...s.gatherings, [id]: record },
      gatheringOrder: [id, ...s.gatheringOrder],
    }));
    db.gatherings.put(record).then(() => schedulePush({ gathering: id }));
    return id;
  },

  renameGathering: (id, name) =>
    set((s) => {
      const p = s.gatherings[id];
      if (!p) return s;
      const updated = { ...p, name, updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush({ gathering: id }));
      return { gatherings: { ...s.gatherings, [id]: updated } };
    }),

  deleteGathering: async (id) => {
    // Serialize against pushes/merges so an in-flight push can't re-upsert this
    // gathering (or its gathering_sets) from a pre-delete Dexie snapshot.
    await withSyncLock(async () => {
      const session = useAuthStore.getState().session;
      if (session) {
        const userId = session.user.id;
        const { error: gsErr } = await supabase
          .from("gathering_sets")
          .delete()
          .eq("gathering_id", id);
        if (gsErr) console.error("[deleteGathering] gathering_sets delete error:", gsErr);

        const { error: gErr } = await supabase
          .from("gatherings")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);
        if (gErr) console.error("[deleteGathering] gatherings delete error:", gErr);
        // Tombstone so other devices holding a copy delete it instead of
        // pushing it back (sync.ts remotelyDeleted).
        await recordDeletions("gathering", [id]);
      }

      await db.gatherings.delete(id);

      set((s) => {
        const { [id]: _gone, ...rest } = s.gatherings;
        return { gatherings: rest, gatheringOrder: s.gatheringOrder.filter((x) => x !== id) };
      });
    });
  },

  addSetToGathering: (gatheringId, setId) =>
    set((s) => {
      const p = s.gatherings[gatheringId];
      if (!p) return s;
      const updated = { ...p, setIds: [...p.setIds, setId], updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush({ gathering: gatheringId }));
      return { gatherings: { ...s.gatherings, [gatheringId]: updated } };
    }),

  removeSetFromGathering: (gatheringId, setIdOrIndex) =>
    set((s) => {
      const p = s.gatherings[gatheringId];
      if (!p) return s;
      let setIds: string[];
      if (typeof setIdOrIndex === "number") {
        setIds = p.setIds.filter((_, i) => i !== setIdOrIndex);
      } else {
        const idx = p.setIds.indexOf(setIdOrIndex);
        if (idx === -1) return s;
        setIds = p.setIds.filter((_, i) => i !== idx);
      }
      const updated = { ...p, setIds, updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush({ gathering: gatheringId }));
      return { gatherings: { ...s.gatherings, [gatheringId]: updated } };
    }),

  reorderGatheringSets: (gatheringId, setIds) =>
    set((s) => {
      const p = s.gatherings[gatheringId];
      if (!p) return s;
      const updated = { ...p, setIds, updatedAt: Date.now() };
      db.gatherings.put(updated).then(() => schedulePush({ gathering: gatheringId }));
      return { gatherings: { ...s.gatherings, [gatheringId]: updated } };
    }),

  goLive: async (gatheringId) => {
    const { gatherings } = get();
    const target = gatherings[gatheringId];
    if (!target) {
      console.error("[goLive] aborted — gathering not found in store:", gatheringId);
      return;
    }
    const session = useAuthStore.getState().session;
    if (!session) {
      console.error("[goLive] aborted — no session");
      return;
    }
    const userId = session.user.id;

    // ── Supabase (source of truth) ────────────────────────────────────────────
    // 1. Take every other gathering offline first, so there is never a window
    //    with two live rows.
    const { error: offlineErr } = await supabase
      .from("gatherings")
      .update({ is_live: false })
      .neq("id", gatheringId)
      .eq("user_id", userId);
    if (offlineErr) {
      console.error("[goLive] offline-others error:", offlineErr);
      throw offlineErr;
    }

    // 2. Upsert the target with is_live: true in a single call — this both
    //    ensures a never-pushed gathering exists and flips it live atomically.
    //    `live_started_at` starts the 24h expiry clock. The DB trigger stamps it
    //    too, but sending it explicitly is what restarts an EXPIRED session:
    //    that row is still is_live=true, so the trigger sees no flip and would
    //    leave the old, already-elapsed timestamp in place.
    const liveStartedAt = Date.now();
    const { error: liveErr } = await supabase.from("gatherings").upsert(
      {
        id: target.id,
        user_id: userId,
        title: target.name,
        share_token: target.share_token,
        is_live: true,
        live_started_at: new Date(liveStartedAt).toISOString(),
        current_set_index: 0,
        current_slide_index: 0,
        created_at: new Date(target.createdAt).toISOString(),
        updated_at: new Date(target.updatedAt).toISOString(),
      },
      { onConflict: "id" },
    );
    if (liveErr) {
      console.error("[goLive] live upsert error:", liveErr);
      throw liveErr;
    }

    // ── Reflect into Dexie + Zustand (do NOT bump updatedAt — is_live is not a
    //    synced content change, and bumping it would trigger a false conflict).
    const allGatherings = await db.gatherings.toArray();
    await db.transaction("rw", db.gatherings, async () => {
      for (const p of allGatherings) {
        if (p.id === gatheringId) {
          await db.gatherings.put({ ...p, is_live: true, live_started_at: liveStartedAt });
        } else if (p.is_live) {
          await db.gatherings.put({ ...p, is_live: false, live_started_at: null });
        }
      }
    });
    set((s) => {
      const updated = { ...s.gatherings };
      for (const id of Object.keys(updated)) {
        const live = id === gatheringId;
        updated[id] = {
          ...updated[id],
          is_live: live,
          live_started_at: live ? liveStartedAt : null,
        };
      }
      return { gatherings: updated };
    });
  },

  endSession: async (gatheringId) => {
    const { gatherings } = get();
    const target = gatherings[gatheringId];
    if (!target) return;
    const session = useAuthStore.getState().session;
    if (!session) {
      console.error("[endSession] aborted — no session");
      return;
    }

    // ── Supabase (source of truth) ────────────────────────────────────────────
    const { error } = await supabase
      .from("gatherings")
      .update({ is_live: false })
      .eq("id", gatheringId)
      .eq("user_id", session.user.id);
    if (error) {
      console.error("[endSession] error:", error);
      throw error;
    }

    // ── Reflect locally without bumping updatedAt ─────────────────────────────
    const updated = { ...target, is_live: false, live_started_at: null };
    set((s) => ({ gatherings: { ...s.gatherings, [gatheringId]: updated } }));
    await db.gatherings.put(updated);
  },

  refreshLiveState: async () => {
    const session = useAuthStore.getState().session;
    if (!session) return;
    const { data, error } = await supabase
      .from("gatherings")
      .select("id, is_live, live_started_at")
      .eq("user_id", session.user.id);
    if (error) {
      console.error("[refreshLiveState] error:", error);
      return;
    }
    // A row past its 24h window is reported as not live, so the presenter's UI
    // agrees with what viewers actually get (see lib/live-session.ts).
    const liveById = new Map(
      (data ?? []).map((r) => {
        const live: LiveWindow = {
          is_live: (r.is_live as boolean) ?? false,
          live_started_at: r.live_started_at
            ? new Date(r.live_started_at as string).getTime()
            : null,
        };
        return [r.id as string, isLiveNow(live) ? live : { is_live: false, live_started_at: null }];
      }),
    );

    // Update only gatherings that exist on the server; leave local-only ones.
    const localGatherings = await db.gatherings.toArray();
    await db.transaction("rw", db.gatherings, async () => {
      for (const p of localGatherings) {
        const live = liveById.get(p.id);
        if (!live) continue;
        if (p.is_live !== live.is_live || p.live_started_at !== live.live_started_at) {
          await db.gatherings.put({ ...p, ...live });
        }
      }
    });
    set((s) => {
      const updated = { ...s.gatherings };
      for (const id of Object.keys(updated)) {
        const live = liveById.get(id);
        if (live) updated[id] = { ...updated[id], ...live };
      }
      return { gatherings: updated };
    });
  },

  nullLocalLiveState: async () => {
    const localGatherings = await db.gatherings.toArray();
    await db.gatherings.bulkPut(
      localGatherings.map((p) => ({ ...p, is_live: null, live_started_at: null })),
    );
    set((s) => {
      const updated = { ...s.gatherings };
      for (const id of Object.keys(updated)) {
        updated[id] = { ...updated[id], is_live: null, live_started_at: null };
      }
      return { gatherings: updated };
    });
  },
}));

// Reactively mirror the in-memory store to Dexie. Dexie's `liveQuery` is
// cross-tab: any write in ANY tab/window (a local mutation, a sync merge, a push
// timestamp writeback, an import) re-emits here and re-derives the whole store.
// This is the load-bearing fix for multi-tab duplication — the store can never
// hold a stale id that was re-keyed/deleted in another tab, so mutations can't
// resurrect a deleted Dexie row. It also replaces the old `sync-complete` /
// `set-sync-v1` BroadcastChannels and the post-sync `loadFromDb()` calls.
if (typeof window !== "undefined") {
  liveQuery(() => Promise.all([db.sets.toArray(), db.gatherings.toArray()])).subscribe({
    next: ([allSets, allGatherings]) =>
      useLibrary.setState(buildLibraryState(allSets, allGatherings)),
    error: (err) => console.error("[store] liveQuery subscription error:", err),
  });
}

// Per-tab section visibility for the presenter, keyed by set id; values are the
// leader slide ids of hidden section groups. Backed by sessionStorage so the
// hiding survives leaving the presenter (home, set editor) but is cleared when
// the tab closes.
const HIDDEN_SECTIONS_KEY = "hidden-sections-v1";

function readHiddenSections(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(HIDDEN_SECTIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

interface HiddenSectionsStore {
  hiddenBySet: Record<string, string[]>;
  setHidden: (setId: string, leaderIds: string[]) => void;
}
export const useHiddenSections = create<HiddenSectionsStore>((set) => ({
  hiddenBySet: typeof window !== "undefined" ? readHiddenSections() : {},
  setHidden: (setId, leaderIds) =>
    set((s) => {
      const next = { ...s.hiddenBySet, [setId]: leaderIds };
      try {
        sessionStorage.setItem(HIDDEN_SECTIONS_KEY, JSON.stringify(next));
      } catch {}
      return { hiddenBySet: next };
    }),
}));

// Ephemeral, non-persisted preview of the song template while the editor is
// open. When non-null, slide views should render with this draft instead of
// the saved `songTemplate` so the user can see changes live.
interface SongTemplateDraftStore {
  draft: SetTemplate | null;
  setDraft: (d: SetTemplate | null) => void;
}
export const useSongTemplateDraft = create<SongTemplateDraftStore>((set) => ({
  draft: null,
  setDraft: (d) => set({ draft: d }),
}));

// Ephemeral draft for scripture template preview.
interface ScriptureTemplateDraftStore {
  draft: SetTemplate | null;
  setDraft: (d: SetTemplate | null) => void;
}
export const useScriptureTemplateDraft = create<ScriptureTemplateDraftStore>((set) => ({
  draft: null,
  setDraft: (d) => set({ draft: d }),
}));

// --- Live presentation state, synced across windows via BroadcastChannel ---

const CHANNEL = "stage-live-v2";
const STORAGE_KEY = "stage-live-v2";

export interface LiveStore extends LiveState {
  setLive: (patch: Partial<LiveState>) => void;
  go: (setId: string, slideId: string) => void;
  clearLive: () => void;
  toggleBlackout: () => void;
  toggleClear: () => void;
  /** Start/stop playback of the current video slide (broadcast to /output). */
  setVideoPlaying: (play: boolean) => void;
  /** Restart the current video from the beginning and play. */
  restartVideo: () => void;
  /** Marked by the output window when the current video finishes. */
  videoFinished: () => void;
}

const DEFAULT_VIDEO_CMD = { action: "pause" as const, nonce: 0 };

/** True when the live video slide is (intended to be) playing. */
export function isVideoPlaying(live: Pick<LiveState, "videoCmd" | "videoEnded">): boolean {
  const a = live.videoCmd?.action;
  return !live.videoEnded && (a === "play" || a === "restart");
}

function defaultLive(): LiveState {
  return {
    setId: null,
    slideId: null,
    blackout: false,
    clear: false,
    blackoutFadeMs: 0,
    videoCmd: DEFAULT_VIDEO_CMD,
    videoEnded: false,
  };
}

// Computes the videoCmd for a freshly-shown slide: autoplay video slides start
// playing, everything else resets to paused so a prior video stops.
function videoCmdForSlide(
  setId: string,
  slideId: string,
  prevNonce: number,
): LiveState["videoCmd"] {
  const slide = useLibrary.getState().sets[setId]?.slides.find((s) => s.id === slideId);
  const action = slide?.kind === "video" && slide.autoplay ? "play" : "pause";
  return { action, nonce: prevNonce + 1 };
}

function readInitial(): LiveState {
  if (typeof window === "undefined") return defaultLive();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultLive(), ...JSON.parse(raw) };
  } catch {}
  return defaultLive();
}

let bc: BroadcastChannel | null = null;
function getChannel() {
  if (typeof window === "undefined") return null;
  if (!bc) bc = new BroadcastChannel(CHANNEL);
  return bc;
}

export const useLive = create<LiveStore>((set, get) => ({
  ...readInitial(),
  setLive: (patch) => {
    set(patch);
    const snapshot = liveSnapshot(get());
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      try {
        getChannel()?.postMessage(snapshot);
      } catch {}
    }
  },
  go: (setId, slideId) => {
    const videoCmd = videoCmdForSlide(setId, slideId, get().videoCmd?.nonce ?? 0);
    if (get().blackout) {
      // Swap the slide silently under the blackout, then reveal with a fade.
      get().setLive({ setId, slideId, clear: false, videoCmd, videoEnded: false });
      if (typeof window !== "undefined") {
        setTimeout(() => get().setLive({ blackout: false, blackoutFadeMs: 500 }), 80);
      }
    } else {
      get().setLive({
        setId,
        slideId,
        blackout: false,
        clear: false,
        blackoutFadeMs: 0,
        videoCmd,
        videoEnded: false,
      });
    }
  },
  clearLive: () => {
    // Dissolve to black over 0.5s, then fully clear.
    get().setLive({ blackout: true, blackoutFadeMs: 500 });
    if (typeof window !== "undefined") {
      setTimeout(() => {
        get().setLive({
          setId: null,
          slideId: null,
          blackout: false,
          clear: false,
          blackoutFadeMs: 0,
        });
      }, 520);
    }
  },
  toggleBlackout: () => {
    const goingDark = !get().blackout;
    const patch: Partial<LiveState> = { blackout: goingDark, blackoutFadeMs: 500 };
    // Fading to black stops the current video and rewinds it to the start,
    // rather than leaving it playing behind the black cover.
    if (goingDark) {
      patch.videoCmd = { action: "stop", nonce: (get().videoCmd?.nonce ?? 0) + 1 };
      patch.videoEnded = false;
    }
    get().setLive(patch);
  },
  toggleClear: () => get().setLive({ clear: !get().clear }),
  setVideoPlaying: (play) =>
    get().setLive({
      videoCmd: { action: play ? "play" : "pause", nonce: (get().videoCmd?.nonce ?? 0) + 1 },
      videoEnded: false,
    }),
  restartVideo: () =>
    get().setLive({
      videoCmd: { action: "restart", nonce: (get().videoCmd?.nonce ?? 0) + 1 },
      videoEnded: false,
    }),
  videoFinished: () =>
    get().setLive({
      videoCmd: { action: "pause", nonce: (get().videoCmd?.nonce ?? 0) + 1 },
      videoEnded: true,
    }),
}));

/** The live snapshot as it currently stands in this window. */
function liveSnapshot(s: LiveState): LiveState {
  return {
    setId: s.setId,
    slideId: s.slideId,
    blackout: s.blackout,
    clear: s.clear,
    blackoutFadeMs: s.blackoutFadeMs,
    videoCmd: s.videoCmd,
    videoEnded: s.videoEnded,
  };
}

/** Adopt an incoming snapshot, ignoring one that says nothing new. The heartbeat
 *  below re-sends the same state on a timer, and without this every tick would
 *  re-render the output window for no reason. */
function adoptLive(next: LiveState) {
  if (JSON.stringify(liveSnapshot(useLive.getState())) === JSON.stringify(next)) return;
  useLive.setState(next);
}

/** Re-read live state from storage. `localStorage` is the durable copy, so this
 *  is how a window that missed a broadcast — because it was frozen, throttled,
 *  or opened late — catches up without waiting for the operator's next click. */
export function resyncLive() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) adoptLive({ ...defaultLive(), ...JSON.parse(raw) });
  } catch {}
}

/**
 * Re-broadcast the live state on a timer, from whichever window is driving the
 * presentation.
 *
 * `setLive` already broadcasts on every change, so in a healthy pair of windows
 * this changes nothing. It exists for the output window that has stopped being
 * healthy: cast to a Chromecast, /output sits in a background tab, and Chrome
 * throttles then freezes tabs that have been backgrounded for a few minutes. A
 * broadcast that lands in that window may be delivered late or not at all, and
 * until the next one it holds the wrong slide. The heartbeat bounds that to one
 * interval instead of "until the operator changes something again".
 */
export function startLiveHeartbeat(intervalMs = 10000): () => void {
  if (typeof window === "undefined") return () => {};
  const timer = setInterval(() => {
    const snapshot = liveSnapshot(useLive.getState());
    // Nothing is live — no one is watching, so don't keep a timer's worth of
    // work going for it.
    if (!snapshot.setId && !snapshot.slideId) return;
    try {
      getChannel()?.postMessage(snapshot);
    } catch {}
  }, intervalMs);
  return () => clearInterval(timer);
}

// Subscribe to broadcast updates
if (typeof window !== "undefined") {
  const ch = getChannel();
  ch?.addEventListener("message", (e) => {
    adoptLive(e.data as LiveState);
  });
  // Coming back from hidden is the other half of the heartbeat: a tab that was
  // frozen wakes with whatever it last saw, and this corrects it immediately
  // rather than on the next tick.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resyncLive();
  });
  window.addEventListener("pageshow", () => resyncLive());
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        adoptLive(JSON.parse(e.newValue));
      } catch {}
    }
    if (e.key === TEMPLATE_KEY && e.newValue) {
      try {
        useLibrary.setState({ songTemplate: JSON.parse(e.newValue) });
      } catch {}
    }
    if (e.key === SCRIPTURE_TEMPLATE_KEY && e.newValue) {
      try {
        useLibrary.setState({ scriptureTemplate: JSON.parse(e.newValue) });
      } catch {}
    }
  });

  const tc = new BroadcastChannel(TEMPLATE_KEY);
  tc.addEventListener("message", (e) => {
    useLibrary.setState({ songTemplate: e.data });
  });

  const stc = new BroadcastChannel(SCRIPTURE_TEMPLATE_KEY);
  stc.addEventListener("message", (e) => {
    useLibrary.setState({ scriptureTemplate: e.data });
  });

  const ftc = new BroadcastChannel(FADE_KEY);
  ftc.addEventListener("message", (e) => {
    useLibrary.setState({ fadeMs: e.data });
  });
}
