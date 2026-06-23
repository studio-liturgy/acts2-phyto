import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  useNavigate,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { APP_NAME } from "@/lib/appConfig";

const isTest = import.meta.env.VITE_APP_ENV === 'test';
const domain = isTest ? "https://phytoexp.live" : "https://phyto.live";
const ogImage = `${domain}/${isTest ? "og-image-or.png" : "og-image.png"}`;
const favicon32 = isTest ? "/favicon-32-or.png" : "/favicon-32.png";
const faviconAny = isTest ? "/favicon-or.png" : "/favicon.png";
const appleTouchIcon = isTest ? "/apple-touch-icon-or.png" : "/apple-touch-icon.png";
import { MobileBlock, MOBILE_ALLOWED } from "@/components/MobileBlock";
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
  pushToSupabase,
  type SyncDiff,
} from "@/lib/sync";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TestSiteWarning } from "@/components/TestSiteWarning";
import { Button } from "@/components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase text-muted-foreground">404</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground">Page not found</h1>
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${APP_NAME} | home gatherings` },
      { name: "description", content: "phyto is a free, open source presentation tool built for worship gatherings in homes. Prepare your verses and lyrics beforehand, then run them live." },
      { property: "og:title", content: `${APP_NAME} | home gatherings` },
      { property: "og:description", content: "phyto is a free, open source presentation tool built for worship gatherings in homes. Prepare your verses and lyrics beforehand, then run them live." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: APP_NAME },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@phyto.live" },
      { name: "twitter:title", content: `${APP_NAME} | home gatherings` },
      { name: "twitter:description", content: "phyto is a free, open source presentation tool built for worship gatherings in homes. Prepare your verses and lyrics beforehand, then run them live." },
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isMobile;
}

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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // Use resolvedLocation (committed) not the pending location so the mobile
  // block stays visible for the full duration of any navigation transition.
  const resolvedPathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });
  const allowedOnMobile = MOBILE_ALLOWED.includes(resolvedPathname);
  const showOutlet = !isMobile || allowedOnMobile;
  const { session, setSession } = useAuthStore();
  const loadFromDb = useLibrary((s) => s.loadFromDb);
  const refreshLiveState = useLibrary((s) => s.refreshLiveState);
  const nullLocalLiveState = useLibrary((s) => s.nullLocalLiveState);
  const [syncDiff, setSyncDiff] = useState<SyncDiff | null>(null);
  const [syncing, setSyncing] = useState<'merge' | 'push' | null>(null);

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') {
        diffRanThisSession = false;
        // No local truth for live status while signed out.
        nullLocalLiveState();
      }
      if (event === 'SIGNED_IN' && s) {
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

  const handleMerge = async () => {
    setSyncing('merge');
    await mergeFromSupabase();
    setSyncing(null);
    setSyncDiff(null);
  };

  const handlePush = async () => {
    setSyncing('push');
    await pushToSupabase();
    setSyncing(null);
    setSyncDiff(null);
  };

  return (
    <QueryClientProvider client={queryClient}>
      {showOutlet && <Outlet />}
      {isMobile && !allowedOnMobile && <MobileBlock />}
      <Dialog open={pathname !== "/output" && syncDiff !== null} onOpenChange={(open) => { if (!open) setSyncDiff(null); }}>
        <DialogContent className="gap-0 rounded-3xl p-8">
          <DialogTitle className="text-2xl font-normal leading-tight">Review versions</DialogTitle>
          <DialogDescription className="mt-4 text-base text-foreground">
            {syncing
              ? syncing === 'merge' ? "Merging…" : "Pushing…"
              : syncDiff && (() => {
                  const remoteTime = latestRemoteTime(syncDiff);
                  return remoteTime
                    ? `Your synced version was last updated ${remoteTime.toLocaleString()}. Merge to receive the online version, or Push to overwrite what's online with your local version.`
                    : "Your local version has offline changes. Push to upload them, or Merge to sync both ways.";
                })()
            }
          </DialogDescription>
          <div className="mt-8 flex gap-3">
            <button
              onClick={handleMerge}
              disabled={syncing !== null}
              className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
            >
              {syncing === 'merge' ? "Merging…" : "Merge"}
            </button>
            <button
              onClick={handlePush}
              disabled={syncing !== null}
              className="mono uppercase flex-1 rounded-full border border-foreground bg-transparent py-2 text-sm transition hover:bg-foreground hover:text-background disabled:opacity-50"
            >
              {syncing === 'push' ? "Pushing…" : "Push"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <TestSiteWarning />
    </QueryClientProvider>
  );
}
