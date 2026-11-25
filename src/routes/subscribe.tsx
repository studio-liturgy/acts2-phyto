import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackLink } from "@/components/BackLink";
import { useBackHomeSearch } from "@/hooks/use-back-home";
import subscribeBg from "@/assets/subscribe-bg.png";
import grain from "@/assets/grain.png";
import { BACK_PAGE_TOP } from "@/lib/page-top";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";
import { APP_NAME } from "@/lib/appConfig";

/** The cyanotype's blue: the picture's own background, and the fill beside it. */
const SUBSCRIBE_BG_FILL = "#1b5c86";

/** The input and the button: one width, centred. */
const PILL_W = "w-full max-w-xs";

export const Route = createFileRoute("/subscribe")({
  head: () => ({
    meta: [{ title: `Stay updated | ${APP_NAME}` }],
  }),
  component: SubscribePage,
});

/**
 * Mailing-list sign-up: an email pill and "Stay updated" under it, on the
 * cyanotype. Joins the same Resend audience as the intro's sign-up
 * (/api/auth/welcome, subscribe without the welcome email).
 */
function SubscribePage() {
  // Opened from the phone's Settings tab: Back returns there.
  const backSearch = useBackHomeSearch();
  usePageBackgroundColor(SUBSCRIBE_BG_FILL);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting" || status === "done") return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/auth/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subscribe: true, skipEmail: true }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div
      className="relative flex min-h-dvh flex-col text-[var(--brand-white)]"
      style={{ backgroundColor: SUBSCRIBE_BG_FILL }}
    >
      {/* Codium adhaerens (Anna Atkins), pixelated: 52 x 106 cells scaled to the
          screen's height, so its middle band (35% to 65%) stays clear for the
          pills on every screen. Grain on top. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-center bg-no-repeat [background-size:auto_100%] [image-rendering:pixelated]"
        style={{ backgroundImage: `url('${subscribeBg}')` }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 mix-blend-overlay [background-size:128px_128px]"
        style={{ backgroundImage: `url('${grain}')` }}
      />
      <header className={`relative mx-auto w-full max-w-6xl px-6 ${BACK_PAGE_TOP}`}>
        {/* Back from within phyto; Home when opened from a link. */}
        <BackLink search={backSearch} tone="opacity-90" freshLabel="Home" />
      </header>
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 pb-24">
        {status === "done" ? (
          <p className="mono text-xs uppercase tracking-wider">You're on the list!</p>
        ) : (
          <form onSubmit={submit} className={`flex flex-col items-center gap-2 ${PILL_W}`}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              placeholder="Email address"
              aria-label="Email address"
              autoComplete="email"
              disabled={status === "submitting"}
              className="pill mono w-full border border-[var(--brand-white)] bg-transparent px-6 py-3 text-center text-xs uppercase tracking-wider text-[var(--brand-white)] outline-none placeholder:text-[var(--brand-white)]/60 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status === "submitting"}
              className="pill mono w-full bg-[var(--brand-white)] px-6 py-3 text-xs uppercase tracking-wider text-[var(--brand-blue)] transition hover:opacity-90 disabled:opacity-60"
            >
              Stay updated
            </button>
            {status === "error" && (
              <p className="mono mt-2 text-xs uppercase tracking-wider opacity-80">
                Something went wrong. Try again?
              </p>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
