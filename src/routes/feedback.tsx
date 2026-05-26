import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback | phyto" },
      { name: "description", content: "Send your feedback, bug reports, feature requests, and encouragement to phyto." },
      { property: "og:title", content: "Feedback | phyto" },
      { property: "og:description", content: "Send your feedback, bug reports, feature requests, and encouragement to phyto." },
      { property: "og:url", content: "https://phyto.live/feedback" },
    ],
    links: [
      { rel: "canonical", href: "https://phyto.live/feedback" },
    ],
  }),
  component: FeedbackPage,
});

type Category = "Testimony / Encouragement" | "Bug Fix" | "Feature Request" | "Design Feedback";

const CATEGORIES: { label: Category; chip: string }[] = [
  {
    label: "Testimony / Encouragement",
    chip: "border-[var(--brand-green)] text-[var(--brand-green)] hover:bg-[var(--brand-green)] hover:text-[var(--brand-white)]",
  },
  {
    label: "Bug Fix",
    chip: "border-[var(--brand-red)] text-[var(--brand-red)] hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]",
  },
  {
    label: "Feature Request",
    chip: "border-[var(--brand-blue)] text-[var(--brand-blue)] hover:bg-[var(--brand-blue)] hover:text-[var(--brand-white)]",
  },
  {
    label: "Design Feedback",
    chip: "border-[var(--brand-orange)] text-[var(--brand-orange)] hover:bg-[var(--brand-orange)] hover:text-[var(--brand-white)]",
  },
];

const ACTIVE_CHIP: Record<Category, string> = {
  "Testimony / Encouragement": "border-[var(--brand-green)] bg-[var(--brand-green)] text-[var(--brand-white)]",
  "Bug Fix": "border-[var(--brand-red)] bg-[var(--brand-red)] text-[var(--brand-white)]",
  "Feature Request": "border-[var(--brand-blue)] bg-[var(--brand-blue)] text-[var(--brand-white)]",
  "Design Feedback": "border-[var(--brand-orange)] bg-[var(--brand-orange)] text-[var(--brand-white)]",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "submitting" | "success" | "error";

function FeedbackPage() {
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const trimmedEmail = email.trim();
  const emailValid = trimmedEmail.length === 0 || (trimmedEmail.length <= 255 && EMAIL_RE.test(trimmedEmail));
  const canSubmit =
    category !== null &&
    message.trim().length > 0 &&
    message.trim().length <= 5000 &&
    emailValid &&
    status !== "submitting";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !category) return;
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/public/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          email: trimmedEmail || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again!");
        return;
      }
      setStatus("success");
      setCategory(null);
      setMessage("");
      setEmail("");
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again!");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto w-full max-w-3xl px-6 pt-10">
        <Link to="/" className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60">
          <ArrowLeft className="h-3.5 w-3.5" /> BACK
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-5xl md:text-6xl leading-none">Submit Feedback</h1>
        <p className="mt-4 text-base text-muted-foreground">
          Pick a category and let us know what's on your mind. We read every message.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORIES.map(({ label, chip }) => {
              const active = category === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCategory(label)}
                  className={`pill mono border-2 px-4 py-1.5 text-xs uppercase tracking-wider transition ${active ? ACTIVE_CHIP[label] : chip}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={category ? `Share your ${category.toLowerCase()}...` : "Select a category, then write here..."}
            rows={10}
            maxLength={5000}
            className="w-full resize-y rounded-3xl border-2 border-foreground bg-background p-6 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
          />

          <div className="space-y-2">
            <label htmlFor="reply-email" className="mono block text-xs uppercase tracking-wider opacity-80">
              Your email <span className="opacity-60">(optional, if you'd like a reply)</span>
            </label>
            <input
              id="reply-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={255}
              autoComplete="email"
              className="w-full rounded-full border-2 border-foreground bg-background px-6 py-3 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
            />
            {!emailValid && (
              <p className="mono text-xs uppercase tracking-wider text-[var(--brand-red)]">
                Please enter a valid email or leave blank.
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-3">
            {status === "success" && (
              <p className="mono text-xs uppercase tracking-wider text-[var(--brand-green)]">
                Thanks for sending in your feedback! We appreciate your time in checking out phyto :)
              </p>
            )}
            {status === "error" && (
              <p className="mono text-xs uppercase tracking-wider text-[var(--brand-red)]">
                {errorMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="pill mono bg-foreground px-6 py-2.5 text-sm uppercase tracking-wider text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "submitting" ? "Sending..." : "Send Feedback"}
            </button>
          </div>
        </form>
      </main>

      <Footer />
    </div>
  );
}
