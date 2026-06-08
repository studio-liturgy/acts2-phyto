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
  applyMerge,
  pushToSupabase,
  type SyncDiff,
} from "@/lib/sync";
import {
  Dialog,
  DialogContent,
  DialogHeader,
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
  const [isMobile, setIsMobile] = useState(false);
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
  const allowedOnMobile = MOBILE_ALLOWED.includes(pathname);
  const showOutlet = !isMobile || allowedOnMobile;
  const { session, setSession } = useAuthStore();
  const loadFromDb = useLibrary((s) => s.loadFromDb);
  const [syncDiff, setSyncDiff] = useState<SyncDiff | null>(null);
  const [syncing, setSyncing] = useState<'merge' | 'push' | null>(null);

  const runDiff = async () => {
    if (pathname.startsWith("/g/")) return;
    const diff = await diffWithSupabase();
    if (!diff) return;
    if (hasDifferences(diff)) {
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
      if (s && !diffRanThisSession) {
        diffRanThisSession = true;
        runDiff();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') {
        diffRanThisSession = false;
      }
      if (event === 'SIGNED_IN' && s) {
        const u = s.user;
        if (u.created_at === u.last_sign_in_at && u.email) {
          fetch('/api/auth/welcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: u.email, name: u.user_metadata?.full_name }),
          }).catch(() => {}); // fire-and-forget, best effort
        }
      }
      if (event === 'SIGNED_IN' && !diffRanThisSession) {
        diffRanThisSession = true;
        runDiff();
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
    const freshDiff = await diffWithSupabase();
    if (freshDiff) await applyMerge(freshDiff);
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
      <MobileBlock />
      <Dialog open={pathname !== "/output" && syncDiff !== null} onOpenChange={(open) => { if (!open) setSyncDiff(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review versions</DialogTitle>
            <DialogDescription>
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
          </DialogHeader>
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleMerge}
              disabled={syncing !== null}
              className="flex-1 rounded-full bg-foreground py-3 text-background transition hover:opacity-90 disabled:opacity-50"
            >
              {syncing === 'merge' ? "Merging…" : "Merge"}
            </button>
            <button
              onClick={handlePush}
              disabled={syncing !== null}
              className="flex-1 rounded-full border border-foreground bg-transparent py-3 transition hover:bg-foreground hover:text-background disabled:opacity-50"
            >
              {syncing === 'push' ? "Pushing…" : "Push"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </QueryClientProvider>
  );
}
