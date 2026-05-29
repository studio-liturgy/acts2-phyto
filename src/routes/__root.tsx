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
import {
  diffWithSupabase,
  hasDifferences,
  applyMerge,
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
      { name: "description", content: "phyto is a free, open source presentation tool built for small home worship gatherings. Prepare your verses and lyrics beforehand, then run it live." },
      { property: "og:title", content: "phyto | home gatherings" },
      { property: "og:description", content: "phyto is a free, open source presentation tool built for small home worship gatherings. Prepare your verses and lyrics beforehand, then run it live." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "phyto" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@phyto.live" },
      { name: "twitter:title", content: "phyto | home gatherings" },
      { name: "twitter:description", content: "phyto is a free, open source presentation tool built for small home worship gatherings. Prepare your verses and lyrics beforehand, then run it live." },
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

  const runDiff = async () => {
    const diff = await diffWithSupabase();
    if (diff && hasDifferences(diff)) setSyncDiff(diff);
  };

  useEffect(() => {
    loadFromDb();
    getSession().then((s) => {
      setSession(s);
      if (s) runDiff();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s && event === "SIGNED_IN") runDiff();
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  useEffect(() => {
    if (session && pathname === "/login") {
      navigate({ to: "/" });
    }
  }, [session, pathname, navigate]);

  const handleMerge = async () => {
    if (!syncDiff) return;
    await applyMerge(syncDiff);
    await loadFromDb();
    setSyncDiff(null);
  };

  return (
    <QueryClientProvider client={queryClient}>
      {showOutlet && <Outlet />}
      <MobileBlock />
      <Dialog open={syncDiff !== null} onOpenChange={(open) => { if (!open) setSyncDiff(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync conflict detected</DialogTitle>
            <DialogDescription>
              {syncDiff && (
                <>
                  {syncDiff.onlyLocal.sets.length > 0 && (
                    <span>{syncDiff.onlyLocal.sets.length} set(s) only on this device. </span>
                  )}
                  {syncDiff.onlyLocal.gatherings.length > 0 && (
                    <span>{syncDiff.onlyLocal.gatherings.length} gathering(s) only on this device. </span>
                  )}
                  {syncDiff.onlyRemote.sets.length > 0 && (
                    <span>{syncDiff.onlyRemote.sets.length} set(s) only in Supabase. </span>
                  )}
                  {syncDiff.onlyRemote.gatherings.length > 0 && (
                    <span>{syncDiff.onlyRemote.gatherings.length} gathering(s) only in Supabase. </span>
                  )}
                  {syncDiff.modified.sets.length > 0 && (
                    <span>{syncDiff.modified.sets.length} set(s) modified. </span>
                  )}
                  {syncDiff.modified.gatherings.length > 0 && (
                    <span>{syncDiff.modified.gatherings.length} gathering(s) modified. </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={handleMerge}>Merge</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </QueryClientProvider>
  );
}
