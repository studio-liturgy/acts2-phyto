import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { APP_NAME } from "@/lib/appConfig";
import { useAuthStore } from "@/lib/authStore";
import { safeNextPath } from "@/lib/session-lost";
import { HANDLE_MAX, HANDLE_PROBLEM_COPY, handleProblem, normalizeHandle } from "@/lib/handle";
import {
  APPLE_NAME_KEY,
  isHandleAvailable,
  saveProfile,
  suggestDisplayName,
  suggestHandle,
  useProfile,
} from "@/lib/profile";

/**
 * Choose a username (@handle), once after signing in, or again from
 * Settings (`?change=1`). The same username as antho: one `profiles` row.
 */
export const Route = createFileRoute("/welcome")({
  validateSearch: (search: Record<string, unknown>): { next?: string; change?: boolean } => {
    const next = safeNextPath(search.next);
    return {
      ...(next ? { next } : {}),
      ...(search.change === true || search.change === "1" || search.change === 1
        ? { change: true }
        : {}),
    };
  },
  head: () => ({
    meta: [{ title: `Username | ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: WelcomePage,
});

type Availability = "idle" | "checking" | "available" | "taken" | "error";

const AVAILABILITY_COPY: Record<Exclude<Availability, "idle">, string> = {
  checking: "Checking",
  available: "Available",
  taken: "Taken. Try another.",
  error: "Couldn't check right now.",
};

function WelcomePage() {
  const { next, change } = Route.useSearch();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const profile = useProfile((s) => s.profile);
  const existing = profile && profile !== "error" ? profile : null;
  const done = () => navigate({ href: next ?? "/", replace: true });

  const [handle, setHandle] = useState("");
  const [touched, setTouched] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed out: nothing to name.
  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/", replace: true });
  }, [authLoading, session, navigate]);

  // Already has one (and not here to change it): carry on.
  useEffect(() => {
    if (existing && !change) done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, change]);

  // Prefill once: the current username, else one from the name or email.
  useEffect(() => {
    if (!session) return;
    const apple = localStorage.getItem(APPLE_NAME_KEY);
    setHandle(
      (v) =>
        v ||
        existing?.handle ||
        suggestHandle(session.user.email, suggestDisplayName(session.user, apple)),
    );
  }, [session, existing]);

  const problem = handle ? handleProblem(handle, session?.user.email) : "too-short";
  const unchanged = !!existing && existing.handle === handle;

  // Check it's free once typing pauses.
  useEffect(() => {
    if (problem || unchanged) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await isHandleAvailable(handle);
      if (cancelled) return;
      setAvailability(result === "error" ? "error" : result ? "available" : "taken");
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, problem, unchanged]);

  const canSave = !!session && !problem && availability !== "taken" && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !canSave) return;
    if (unchanged) return done();
    setError(null);
    setSaving(true);
    const name =
      existing?.display_name ||
      suggestDisplayName(session.user, localStorage.getItem(APPLE_NAME_KEY)) ||
      handle;
    const result = await saveProfile({ user_id: session.user.id, handle, display_name: name });
    setSaving(false);
    if (result.ok) return done();
    if (result.reason === "taken") setAvailability("taken");
    else setError("Couldn't save. Please try again.");
  };

  const hint =
    error ??
    (touched && problem
      ? HANDLE_PROBLEM_COPY[problem]
      : availability !== "idle"
        ? AVAILABILITY_COPY[availability]
        : "");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] pt-[calc(env(safe-area-inset-top,0px)+2rem)] text-foreground">
      <form onSubmit={submit} className="w-full max-w-sm">
        <h1 className="text-2xl font-normal leading-tight">
          {change ? "Change your username" : "Choose a username"}
        </h1>
        <p className="mt-4 text-base">
          People see it when you share sets and gatherings or invite them to a group, and they can
          share with you by it.
        </p>
        <label className="mt-8 flex items-center gap-1 rounded-full border border-foreground px-4 py-2">
          <span className="text-foreground/50" aria-hidden>
            @
          </span>
          <input
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            maxLength={HANDLE_MAX}
            value={handle}
            onChange={(e) => {
              setTouched(true);
              setHandle(normalizeHandle(e.target.value));
            }}
            disabled={saving}
            aria-label="Username"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </label>
        {/* Space kept, so nothing moves when the hint changes. */}
        <p
          className={`mono mt-2 h-4 px-4 text-[10px] uppercase tracking-wider ${
            error || availability === "taken" || (touched && problem)
              ? "text-[var(--brand-red)]"
              : "text-foreground/60"
          }`}
        >
          {hint}
        </p>
        <div className="mt-8 flex gap-3">
          <button
            type="submit"
            disabled={!canSave}
            className="mono uppercase flex-1 rounded-full bg-foreground py-2 text-sm text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Saving" : change ? "Save" : "Continue"}
          </button>
          {change && (
            <button
              type="button"
              onClick={done}
              className="mono uppercase flex-1 rounded-full border border-foreground py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
