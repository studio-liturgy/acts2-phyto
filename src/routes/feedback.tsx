import { createFileRoute, Link } from "@tanstack/react-router";
import { useBackHomeSearch } from "@/hooks/use-back-home";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { APP_NAME } from "@/lib/appConfig";
import { usePhoneLayout } from "@/hooks/use-phone-layout";
import { PHONE_UI } from "@/lib/phone-layout";
import { useUserEmail } from "@/lib/authStore";
import { FEEDBACK_DEVICES, guessDevice, type FeedbackDevice } from "@/lib/feedback-device";

// phytoexp.live: the form is for mobile testers, so it also asks for the device.
const isTest = import.meta.env.VITE_APP_ENV === "test";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: `Feedback | ${APP_NAME}` },
      {
        name: "description",
        content: "Send your feedback, bug reports, feature requests, and encouragement to phyto.",
      },
      { property: "og:title", content: `Feedback | ${APP_NAME}` },
      {
        property: "og:description",
        content: "Send your feedback, bug reports, feature requests, and encouragement to phyto.",
      },
      { property: "og:url", content: "https://phyto.live/feedback" },
    ],
    links: [{ rel: "canonical", href: "https://phyto.live/feedback" }],
  }),
  component: FeedbackPage,
});

type Category = "Encouragement" | "Bug Fix" | "Feature Request" | "Language";

const CATEGORIES: { label: Category; chip: string }[] = [
  {
    label: "Encouragement",
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
    label: "Language",
    chip: "border-[var(--brand-orange)] text-[var(--brand-orange)] hover:bg-[var(--brand-orange)] hover:text-[var(--brand-white)]",
  },
];

const ACTIVE_CHIP: Record<Category, string> = {
  Encouragement: "border-[var(--brand-green)] bg-[var(--brand-green)] text-[var(--brand-white)]",
  "Bug Fix": "border-[var(--brand-red)] bg-[var(--brand-red)] text-[var(--brand-white)]",
  "Feature Request": "border-[var(--brand-blue)] bg-[var(--brand-blue)] text-[var(--brand-white)]",
  Language: "border-[var(--brand-orange)] bg-[var(--brand-orange)] text-[var(--brand-white)]",
};

// phytoexp.live: testers report bugs and feature ideas, not encouragement or
// language requests.
const VISIBLE_CATEGORIES = isTest
  ? CATEGORIES.filter((c) => c.label === "Bug Fix" || c.label === "Feature Request")
  : CATEGORIES;

const PLACEHOLDER: Record<Category, string> = {
  Encouragement: "Share your encouragement...",
  "Bug Fix": isTest
    ? "Which screen were you on, what did you tap, and what happened?"
    : "What went wrong, and what did you expect?",
  "Feature Request": "What would you like phyto to do?",
  Language: "What language and bible versions are you looking for?",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "submitting" | "success" | "error";

function FeedbackPage() {
  const backSearch = useBackHomeSearch();
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  // Phone: Send Feedback in the big button size (Delete gathering's).
  const phone = usePhoneLayout() === true && PHONE_UI;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [device, setDevice] = useState<FeedbackDevice | null>(null);
  const [deviceModel, setDeviceModel] = useState("");
  const [detected, setDetected] = useState("");
  const accountEmail = useUserEmail();

  // Test build: pre-select the device type from the browser, and pre-fill the
  // reply email with the tester's account.
  useEffect(() => {
    if (!isTest) return;
    const guess = guessDevice(navigator.userAgent, navigator.maxTouchPoints > 1);
    setDevice((d) => d ?? guess.device);
    setDetected(guess.detail);
  }, []);
  useEffect(() => {
    if (isTest && accountEmail) setEmail((e) => e || accountEmail);
  }, [accountEmail]);

  const trimmedEmail = email.trim();
  const emailValid =
    trimmedEmail.length === 0 || (trimmedEmail.length <= 255 && EMAIL_RE.test(trimmedEmail));
  const canSubmit =
    category !== null &&
    message.trim().length > 0 &&
    message.trim().length <= 5000 &&
    emailValid &&
    (!isTest || (device !== null && deviceModel.trim().length > 0)) &&
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
          ...(isTest && device
            ? { device, deviceModel: [deviceModel.trim(), detected].filter(Boolean).join(", ") }
            : {}),
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
      setEmail(isTest && accountEmail ? accountEmail : "");
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again!");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto w-full max-w-3xl px-6 pt-10">
        <Link
          to="/"
          search={backSearch}
          className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> BACK
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p className="text-base text-muted-foreground">
          {isTest
            ? "Tell me what broke, what felt off, or what you loved through the form below."
            : "Pick a category and let us know what's on your mind."}
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {VISIBLE_CATEGORIES.map(({ label, chip }) => {
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

          {isTest && (
            <div className="space-y-2">
              <p className="mono block text-xs uppercase tracking-wider opacity-80">
                Your device {detected && <span className="opacity-60">({detected})</span>}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {FEEDBACK_DEVICES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    className={`pill mono border-2 border-foreground px-4 py-1.5 text-xs uppercase tracking-wider transition ${device === d ? "bg-foreground text-background" : "text-foreground hover:bg-foreground hover:text-background"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <input
                type="text"
                aria-label="Device model"
                value={deviceModel}
                onChange={(e) => setDeviceModel(e.target.value)}
                placeholder={
                  device === "Computer"
                    ? "Browser, e.g. Chrome on Mac or Windows"
                    : "Model, e.g. iPhone 15 or Pixel 8"
                }
                maxLength={120}
                className="mono w-full rounded-full border border-foreground bg-background px-6 py-3 text-sm uppercase outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
              />
            </div>
          )}

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={category ? PLACEHOLDER[category] : "Select a category, then write here..."}
            rows={10}
            maxLength={5000}
            className="w-full resize-y rounded-3xl border border-foreground bg-background p-6 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
          />

          {!isTest && (
            <div className="space-y-2">
              <label
                htmlFor="reply-email"
                className="mono block text-xs uppercase tracking-wider opacity-80"
              >
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
                className="mono w-full rounded-full border border-foreground bg-background px-6 py-3 text-sm uppercase outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
              />
              {!emailValid && (
                <p className="mono text-xs uppercase tracking-wider text-[var(--brand-red)]">
                  Please enter a valid email or leave blank.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col items-end gap-3">
            {status === "success" && (
              <p className="mono text-xs uppercase tracking-wider text-[var(--brand-green)]">
                Thanks for sending in your feedback! We appreciate your time in checking out phyto
                :)
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
              className={`pill mono bg-foreground ${phone ? "px-6 py-3" : "px-4 py-1.5"} text-xs uppercase tracking-wider text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40`}
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
