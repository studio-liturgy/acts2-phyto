import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { APP_NAME } from "@/lib/appConfig";

const isTest = import.meta.env.VITE_APP_ENV === "test";
const domain = isTest ? "https://phytoexp.live" : "https://phyto.live";
const ogImage = `${domain}/${isTest ? "og-image-or.png" : "og-image.png"}`;
const favicon32 = isTest ? "/favicon-32-or.png" : "/favicon-32.png";
const faviconAny = isTest ? "/favicon-or.png" : "/favicon.png";
const appleTouchIcon = isTest ? "/apple-touch-icon-or.png" : "/apple-touch-icon.png";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { useAuthStore } from "@/lib/authStore";
import { useLibrary } from "@/lib/store";
import { migrateLegacyLocalStorage } from "@/lib/migrate-legacy";
import {
  diffWithSupabase,
  hasDifferences,
  latestRemoteTime,
  mergeFromSupabase,
  pushMirrorToSupabase,
  replaceWithSupabase,
  previewEffects,
  type SyncAction,
  type SyncEffects,
  type SyncDiff,
} from "@/lib/sync";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TestSiteWarning } from "@/components/TestSiteWarning";
import { Button } from "@/components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase text-muted-foreground">404</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild className="font-mono uppercase">
            <Link to="/">Go home</Link>
          </Button>
          <Button
            asChild
            className="pill font-mono uppercase border-[var(--brand-blue)] bg-[var(--brand-blue)] px-6 text-[var(--brand-white)] hover:bg-[var(--brand-blue)] hover:opacity-90"
          >
            <Link to="/feedback">Feedback</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase text-muted-foreground">Error</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            className="font-mono uppercase"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button asChild variant="outline" className="font-mono uppercase">
            <a href="/">Go home</a>
          </Button>
          <Button
            asChild
            className="pill font-mono uppercase border-[var(--brand-blue)] bg-[var(--brand-blue)] px-6 text-[var(--brand-white)] hover:bg-[var(--brand-blue)] hover:opacity-90"
          >
            <Link to="/feedback">Feedback</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      // Baseline so the tag exists from first paint (matches --background) — pages that
      // tint via usePageBackgroundColor then update this element's content in place
      // instead of inserting a brand-new <meta>, which Safari picks up more reliably
      // for coloring the safe-area/bottom-toolbar region.
      { name: "theme-color", content: "#F5EFEF" },
      { title: `${APP_NAME} | home gatherings` },
      {
        name: "description",
        content:
          "phyto is a free, open source presentation tool built for worship gatherings in homes. Prepare your verses and lyrics beforehand, then run them live.",
      },
      { property: "og:title", content: `${APP_NAME} | home gatherings` },
      {
        property: "og:description",
        content:
          "phyto is a free, open source presentation tool built for worship gatherings in homes. Prepare your verses and lyrics beforehand, then run them live.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: APP_NAME },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@phyto.live" },
      { name: "twitter:title", content: `${APP_NAME} | home gatherings` },
      {
        name: "twitter:description",
        content:
          "phyto is a free, open source presentation tool built for worship gatherings in homes. Prepare your verses and lyrics beforehand, then run them live.",
      },
      { property: "og:image", content: ogImage },
      { name: "twitter:image", content: ogImage },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: favicon32 },
      { rel: "icon", type: "image/png", sizes: "any", href: faviconAny },
      { rel: "apple-touch-icon", sizes: "180x180", href: appleTouchIcon },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const themeInitScript = `(function(){try{var m=localStorage.getItem('phyto-theme');if(!m)m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(m==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

let diffRanThisSession = false;

const SYNC_ACTION_LABEL: Record<SyncAction, string> = {
  merge: "Merge",
  push: "Push",
  replace: "Replace",
};

/** Number of non-empty Added/Updated/Removed columns across both sides — used to
 *  size the confirmation dialog so it's only as wide as it needs to be. */
function countEffectColumns(e: SyncEffects): number {
  let n = 0;
  for (const side of [e.local, e.account]) {
    for (const group of [side.added, side.updated, side.removed]) {
      if (group.sets.length || group.gatherings.length) n++;
    }
  }
  return n;
}

/** Dialog max-width per column count (literal classes so Tailwind keeps them). */
const EFFECTS_DIALOG_WIDTH: Record<number, string> = {
  1: "sm:max-w-lg",
  2: "sm:max-w-lg",
  3: "sm:max-w-2xl",
  4: "sm:max-w-3xl",
  5: "sm:max-w-4xl",
};

/** "June 17 at 3:10 PM" — no year, no seconds. */
function formatSyncTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One column of changed item names (e.g. "Added"). Renders nothing when empty so
 *  only the relevant buckets show. `destructive` reddens the label for deletions. */
function EffectColumn({
  label,
  sets,
  gatherings,
  destructive,
}: {
  label: string;
  sets: string[];
  gatherings: string[];
  destructive?: boolean;
}) {
  if (sets.length === 0 && gatherings.length === 0) return null;
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const sortedGatherings = [...gatherings].sort(byName);
  const sortedSets = [...sets].sort(byName);
  return (
    <div className="min-w-0 flex-1">
      <div
        className={`mono text-xs uppercase ${destructive ? "text-red-600" : "text-muted-foreground"}`}
      >
        {label}
      </div>
      <ul className="catalogue-scroll mt-1 max-h-40 space-y-0.5 overflow-y-auto pr-2">
        {sortedGatherings.map((name, i) => (
          <li key={`g-${i}`} className="truncate text-sm">
            {name || "Untitled gathering"}
          </li>
        ))}
        {sortedGatherings.length > 0 && sortedSets.length > 0 && (
          <li aria-hidden className="mb-1.5 mt-1.5 border-t border-border" />
        )}
        {sortedSets.map((name, i) => (
          <li key={`s-${i}`} className="truncate text-sm">
            {name || "Untitled set"}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "On this device" / "On your account" effects of the pending action, laid out
 *  as Added / Updated / Removed columns. Only non-empty columns render; the side
 *  grows in proportion to how many columns it has so every column is ~equal width
 *  across the row. */
function EffectsSide({ title, side }: { title: string; side: SyncEffects["local"] }) {
  const columns = [
    { label: "Added", names: side.added },
    { label: "Updated", names: side.updated },
    { label: "Removed", names: side.removed, destructive: true },
  ].filter((c) => c.names.sets.length || c.names.gatherings.length);
  if (columns.length === 0) return null;
  return (
    <section className="min-w-0" style={{ flexGrow: columns.length, flexBasis: 0 }}>
      <h3 className="mono text-sm uppercase tracking-wide">{title}</h3>
      <div className="mt-2 flex gap-6">
        {columns.map((c) => (
          <EffectColumn
            key={c.label}
            label={c.label}
            sets={c.names.sets}
            gatherings={c.names.gatherings}
            destructive={c.destructive}
          />
        ))}
      </div>
    </section>
  );
}

function EffectsSummary({ effects }: { effects: SyncEffects }) {
  const sideHasChanges = (s: SyncEffects["local"]) =>
    [s.added, s.updated, s.removed].some((g) => g.sets.length || g.gatherings.length);

  if (!sideHasChanges(effects.local) && !sideHasChanges(effects.account)) {
    return <p className="mt-4 text-sm text-muted-foreground">No changes.</p>;
  }

  return (
    <div className="mt-4 flex flex-wrap items-start gap-x-10 gap-y-6">
      <EffectsSide title="On this device" side={effects.local} />
      <EffectsSide title="On your account" side={effects.account} />
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session, setSession } = useAuthStore();
  const loadFromDb = useLibrary((s) => s.loadFromDb);
  const refreshLiveState = useLibrary((s) => s.refreshLiveState);
  const nullLocalLiveState = useLibrary((s) => s.nullLocalLiveState);
  const [syncDiff, setSyncDiff] = useState<SyncDiff | null>(null);
  const [pendingAction, setPendingAction] = useState<SyncAction | null>(null);
  const [applying, setApplying] = useState(false);

  const runDiff = async (autoMerge = false) => {
    if (pathname.startsWith("/g/")) return;
    const diff = await diffWithSupabase();
    if (!diff || !hasDifferences(diff)) return;
    // Only prompt when there's a real remote version to reconcile against.
    // `latestRemoteTime` is null when the diff has no onlyRemote/modified/rekeyed
    // items — i.e. only local changes to push (brand-new account / first push),
    // where Merge and Push are equivalent and nothing online can be overwritten.
    // Apply silently in that case (and on explicit first-login autoMerge).
    if (autoMerge || latestRemoteTime(diff) === null) {
      // Serialized + recompute-inside-lock so concurrent/repeat auto-merges are
      // clean no-ops. The store refreshes via the Dexie liveQuery in store.ts.
      await mergeFromSupabase();
    } else {
      setSyncDiff(diff);
    }
  };

  useEffect(() => {
    (async () => {
      await migrateLegacyLocalStorage(); // one-time; no-op after first run
      await loadFromDb();
    })();
    getSession().then((s) => {
      setSession(s);
      if (s) {
        // Hydrate is_live from Supabase (source of truth) on every page load,
        // independent of the diff-dialog gate and the /g/ guard.
        refreshLiveState();
        if (!diffRanThisSession) {
          diffRanThisSession = true;
          runDiff();
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") {
        diffRanThisSession = false;
        // No local truth for live status while signed out.
        nullLocalLiveState();
      }
      if (event === "SIGNED_IN" && s) {
        // Welcome email is sent from auth.callback.tsx (respects mailing-list opt-in).
        const isFirstLogin = s.user.created_at === s.user.last_sign_in_at;
        refreshLiveState();
        if (!diffRanThisSession) {
          diffRanThisSession = true;
          runDiff(isFirstLogin);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  useEffect(() => {
    if (session && pathname === "/login") {
      navigate({ to: "/" });
    }
  }, [session, pathname, navigate]);

  const closeSyncDialog = () => {
    setSyncDiff(null);
    setPendingAction(null);
    setApplying(false);
  };

  const handleApply = async () => {
    if (!pendingAction || !syncDiff) return;
    setApplying(true);
    if (pendingAction === "merge") await mergeFromSupabase();
    else if (pendingAction === "push") await pushMirrorToSupabase(syncDiff);
    else await replaceWithSupabase();
    closeSyncDialog();
  };

  const pendingEffects = syncDiff && pendingAction ? previewEffects(syncDiff, pendingAction) : null;
  const effectsDialogWidth = pendingEffects
    ? (EFFECTS_DIALOG_WIDTH[countEffectColumns(pendingEffects)] ?? "sm:max-w-4xl")
    : "";

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Dialog
        open={pathname !== "/output" && syncDiff !== null}
        onOpenChange={(open) => {
          if (!open && !applying) closeSyncDialog();
        }}
      >
        <DialogContent className={`gap-0 rounded-3xl p-8 ${effectsDialogWidth}`}>
          {syncDiff && !pendingAction && (
            <>
              <DialogTitle className="text-2xl font-normal leading-tight">
                Review versions
              </DialogTitle>
              <DialogDescription className="mt-4 text-base text-foreground">
                {(() => {
                  const remoteTime = latestRemoteTime(syncDiff);
                  const when = remoteTime
                    ? `Your synced version was last updated on ${formatSyncTime(remoteTime)}. `
                    : "Your local version has offline changes. ";
                  return `${when}Merge to combine both, Push to overwrite what's online with your local version, or Replace to discard local and use the account.`;
                })()}
              </DialogDescription>
              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setPendingAction("merge")}
                  className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
                >
                  Merge
                </button>
                <button
                  onClick={() => setPendingAction("push")}
                  className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
                >
                  Push
                </button>
                <button
                  onClick={() => setPendingAction("replace")}
                  className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background"
                >
                  Replace
                </button>
              </div>
            </>
          )}

          {syncDiff && pendingAction && (
            <>
              <DialogTitle className="text-2xl font-normal leading-tight">
                {SYNC_ACTION_LABEL[pendingAction]}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground">
                {applying ? "Applying…" : "Review what this will change before applying."}
              </DialogDescription>
              {pendingEffects && <EffectsSummary effects={pendingEffects} />}
              <div className="mt-8 flex gap-3">
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
                >
                  {applying ? "Applying…" : "Apply"}
                </button>
                <button
                  onClick={() => setPendingAction(null)}
                  disabled={applying}
                  className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <TestSiteWarning />
    </QueryClientProvider>
  );
}
