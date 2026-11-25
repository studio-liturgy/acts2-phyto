import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import subscribeBg from "@/assets/subscribe-bg.webp";
import { BACK_PAGE_TOP } from "@/lib/page-top";
import { usePageBackgroundColor } from "@/hooks/use-page-background-color";
import { useImageReady } from "@/hooks/use-image-ready";
import { APP_NAME } from "@/lib/appConfig";

/** The cyanotype's blue, behind it while it loads. */
const SUBSCRIBE_BG_FILL = "#25699a";

/** The input and the button: one width, centred. */
const PILL_W = "w-full max-w-xs";

export const Route = createFileRoute("/subscribe")({
  head: () => ({
    meta: [{ title: `Stay updated | ${APP_NAME}` }],
    links: [{ rel: "preload", as: "image", href: subscribeBg }],
  }),
  component: SubscribePage,
});

/**
 * Mailing-list sign-up: an email pill and "Stay updated" under it, on the
 * cyanotype. Joins the same Resend audience as the intro's sign-up
 * (/api/auth/welcome, subscribe without the welcome email).
 */
function SubscribePage() {
  usePageBackgroundColor(SUBSCRIBE_BG_FILL);
  const bgReady = useImageReady(subscribeBg);
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
      {/* The picture appears whole: hidden until decoded (at once when cached). */}
      <div
        aria-hidden
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat ${
          bgReady === "instant" ? "" : "transition-opacity duration-300"
        } ${bgReady ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundImage: `url('${subscribeBg}')` }}
      />
      <header
        className={`relative mx-auto flex w-full max-w-6xl justify-end px-6 ${BACK_PAGE_TOP}`}
      >
        <Link
          to="/"
          className="mono flex w-fit items-center gap-1.5 text-xs uppercase tracking-wider opacity-90 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-3 w-3" /> Home
        </Link>
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
