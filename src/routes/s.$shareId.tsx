import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useIsSignedIn } from "@/lib/authStore";
import { claimShares, saveSharedSet } from "@/lib/sync";
import { APP_NAME } from "@/lib/appConfig";

export const Route = createFileRoute("/s/$shareId")({
  head: () => ({
    meta: [{ title: `Shared set | ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: AcceptShare,
});

type Status = "working" | "signin" | "notfound" | "error";

function AcceptShare() {
  const { shareId } = Route.useParams();
  const navigate = useNavigate();
  const isSignedIn = useIsSignedIn();
  const [status, setStatus] = useState<Status>("working");

  useEffect(() => {
    if (!isSignedIn) {
      setStatus("signin");
      return;
    }
    let cancelled = false;
    (async () => {
      // Claim first so the RLS grant admits the set read below.
      await claimShares();
      const { data, error } = await supabase
        .from("set_shares")
        .select("set_id")
        .eq("id", shareId)
        .maybeSingle();
      if (cancelled) return;
      if (error) return setStatus("error");
      if (!data) return setStatus("notfound");
      const ok = await saveSharedSet(data.set_id as string);
      if (cancelled) return;
      if (!ok) return setStatus("error");
      navigate({ to: "/" });
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, shareId, navigate]);

  const message: Record<Status, string> = {
    working: "Saving the shared set to your library…",
    signin: "Sign in to accept this shared set. It was shared with a specific email address.",
    notfound:
      "This shared set isn't available for your account. It may have been shared with a different email, or the owner revoked it.",
    error: "Something went wrong saving this set. Please try again.",
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <span className="h-4 w-4 animate-pulse rounded-full bg-[var(--brand-blue)]" />
      <h1 className="mono mt-6 text-sm uppercase tracking-wider">Shared set</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{message[status]}</p>
      {status === "signin" && (
        <Link
          to="/login"
          className="pill mono uppercase mt-6 border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
        >
          Sign in
        </Link>
      )}
      {(status === "notfound" || status === "error") && (
        <Link
          to="/"
          className="pill mono uppercase mt-6 border border-foreground px-4 py-1.5 text-xs tracking-wider transition hover:bg-foreground hover:text-background"
        >
          Go to library
        </Link>
      )}
    </div>
  );
}
