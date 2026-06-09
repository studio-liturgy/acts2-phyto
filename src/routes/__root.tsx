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

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
          <Link
            to="/feedback"
            className="pill inline-flex items-center justify-center border border-[var(--brand-blue)] bg-[var(--brand-blue)] px-6 py-2 text-sm font-medium text-[var(--brand-white)] transition hover:opacity-90"
          >
            Feedback
          </Link>
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
          <Link
            to="/feedback"
            className="pill inline-flex items-center justify-center border border-[var(--brand-blue)] bg-[var(--brand-blue)] px-6 py-2 text-sm font-medium text-[var(--brand-white)] transition hover:opacity-90"
          >
            Feedback
          </Link>
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
      { title: "phyto | home gatherings" },
      { name: "description", content: "phyto is a free, open source presentation tool built for worship gatherings in homes. Prepare your verses and lyrics beforehand, then run them live." },
      { property: "og:title", content: "phyto | home gatherings" },
      { property: "og:description", content: "phyto is a free, open source presentation tool built for worship gatherings in homes. Prepare your verses and lyrics beforehand, then run them live." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "phyto" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@phyto.live" },
      { name: "twitter:title", content: "phyto | home gatherings" },
      { name: "twitter:description", content: "phyto is a free, open source presentation tool built for worship gatherings in homes. Prepare your verses and lyrics beforehand, then run them live." },
      { property: "og:image", content: "https://phyto.live/og-image.png" },
      { name: "twitter:image", content: "https://phyto.live/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "any", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
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
      // Serialized + recompute-inside-lock so concurrent/repeat auto-merges
      // can't double-apply (the only-local re-ID push is not idempotent).
      await mergeFromSupabase();
      await loadFromDb();
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
    await loadFromDb();
    setSyncing(null);
    setSyncDiff(null);
  };

  const handlePush = async () => {
    setSyncing('push');
    await pushToSupabase();
    await loadFromDb();
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
    </QueryClientProvider>
  );
}
