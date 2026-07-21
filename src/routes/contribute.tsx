import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BackToTop } from "@/components/BackToTop";
import { Footer } from "@/components/Footer";
import { APP_NAME } from "@/lib/appConfig";

export const Route = createFileRoute("/contribute")({
  head: () => ({
    meta: [
      { title: `Contribute | ${APP_NAME}` },
      {
        name: "description",
        content:
          "phyto is looking for people to help with app development, backend, UI/UX design, graphic design, social media, and more. If you love Jesus and want to contribute, we'd love to hear from you.",
      },
      { property: "og:title", content: `Contribute | ${APP_NAME}` },
      {
        property: "og:description",
        content:
          "phyto is looking for people to help with app development, backend, UI/UX design, graphic design, social media, and more. If you love Jesus and want to contribute, we'd love to hear from you.",
      },
      { property: "og:url", content: "https://phyto.live/contribute" },
    ],
    links: [{ rel: "canonical", href: "https://phyto.live/contribute" }],
  }),
  component: ContributePage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "submitting" | "success" | "error";

type Category =
  | "App Development"
  | "Backend Development"
  | "UI/UX Design"
  | "Graphic Design"
  | "Social Media"
  | "Other";

const CATEGORIES: { label: Category; chip: string }[] = [
  {
    label: "App Development",
    chip: "border-[var(--brand-blue)] text-[var(--brand-blue)] hover:bg-[var(--brand-blue)] hover:text-[var(--brand-white)]",
  },
  {
    label: "Backend Development",
    chip: "border-[var(--brand-green)] text-[var(--brand-green)] hover:bg-[var(--brand-green)] hover:text-[var(--brand-white)]",
  },
  {
    label: "UI/UX Design",
    chip: "border-[var(--brand-orange)] text-[var(--brand-orange)] hover:bg-[var(--brand-orange)] hover:text-[var(--brand-white)]",
  },
  {
    label: "Graphic Design",
    chip: "border-[var(--brand-red)] text-[var(--brand-red)] hover:bg-[var(--brand-red)] hover:text-[var(--brand-white)]",
  },
  {
    label: "Social Media",
    chip: "border-[var(--brand-orange-dark)] text-[var(--brand-orange-dark)] hover:bg-[var(--brand-orange-dark)] hover:text-[var(--brand-white)]",
  },
  {
    label: "Other",
    chip: "border-foreground text-foreground hover:bg-foreground hover:text-background",
  },
];

const ACTIVE_CHIP: Record<Category, string> = {
  "App Development": "border-[var(--brand-blue)] bg-[var(--brand-blue)] text-[var(--brand-white)]",
  "Backend Development":
    "border-[var(--brand-green)] bg-[var(--brand-green)] text-[var(--brand-white)]",
  "UI/UX Design":
    "border-[var(--brand-orange)] bg-[var(--brand-orange)] text-[var(--brand-white)]",
  "Graphic Design": "border-[var(--brand-red)] bg-[var(--brand-red)] text-[var(--brand-white)]",
  "Social Media":
    "border-[var(--brand-orange-dark)] bg-[var(--brand-orange-dark)] text-[var(--brand-white)]",
  Other: "border-foreground bg-foreground text-background",
};

function ContributePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [portfolio, setPortfolio] = useState("");
  const [experience, setExperience] = useState("");
  const [heardAbout, setHeardAbout] = useState("");
  const [testimony, setTestimony] = useState("");
  const [motivation, setMotivation] = useState("");
  const [aiExperience, setAiExperience] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const trimmedEmail = email.trim();
  const emailValid = trimmedEmail.length > 0 && trimmedEmail.length <= 255 && EMAIL_RE.test(trimmedEmail);
  const canSubmit =
    name.trim().length > 0 &&
    emailValid &&
    categories.length > 0 &&
    experience.trim().length > 0 &&
    experience.trim().length <= 2000 &&
    heardAbout.trim().length > 0 &&
    testimony.trim().length > 0 &&
    testimony.trim().length <= 3000 &&
    motivation.trim().length > 0 &&
    motivation.trim().length <= 2000 &&
    aiExperience.trim().length > 0 &&
    status !== "submitting";

  const toggleCategory = (category: Category) => {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/public/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: trimmedEmail,
          categories,
          portfolio: portfolio.trim() || undefined,
          experience: experience.trim(),
          heardAbout: heardAbout.trim(),
          testimony: testimony.trim(),
          motivation: motivation.trim(),
          aiExperience: aiExperience.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again!");
        return;
      }
      setStatus("success");
      setName("");
      setEmail("");
      setCategories([]);
      setPortfolio("");
      setExperience("");
      setHeardAbout("");
      setTestimony("");
      setMotivation("");
      setAiExperience("");
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
          className="mono flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> BACK
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-5xl md:text-6xl leading-none">Contribute</h1>
        <p className="mt-4 text-base text-muted-foreground">
          If you love Jesus and want to contribute to this project, whether that&rsquo;s app
          development, backend, UI/UX design, graphic design, social media, or something else,
          we&rsquo;d love to hear from you.
        </p>
        <p className="mt-4 text-base text-muted-foreground">
          Please note that this is a volunteer basis: unpaid, and done out of love for the church!
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-6">
          <div className="space-y-2">
            <label htmlFor="name" className="mono block text-xs uppercase tracking-wider opacity-80">
              Your name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              maxLength={200}
              autoComplete="name"
              className="w-full rounded-full border border-foreground bg-background px-6 py-3 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="mono block text-xs uppercase tracking-wider opacity-80">
              Your email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={255}
              autoComplete="email"
              className="w-full rounded-full border border-foreground bg-background px-6 py-3 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
            />
            {email.length > 0 && !emailValid && (
              <p className="mono text-xs uppercase tracking-wider text-[var(--brand-red)]">
                Please enter a valid email.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="mono block text-xs uppercase tracking-wider opacity-80">
              How would you like to help?
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORIES.map(({ label, chip }) => {
                const active = categories.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleCategory(label)}
                    className={`pill mono border-2 px-4 py-1.5 text-xs uppercase tracking-wider transition ${active ? ACTIVE_CHIP[label] : chip}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="portfolio"
              className="mono block text-xs uppercase tracking-wider opacity-80"
            >
              Portfolio / Instagram <span className="opacity-60">(optional)</span>
            </label>
            <input
              id="portfolio"
              type="text"
              value={portfolio}
              onChange={(e) => setPortfolio(e.target.value)}
              placeholder="https://..."
              maxLength={500}
              className="w-full rounded-full border border-foreground bg-background px-6 py-3 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="experience"
              className="mono block text-xs uppercase tracking-wider opacity-80"
            >
              Your experience
            </label>
            <textarea
              id="experience"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="Tell us about your background in the areas you selected above..."
              rows={6}
              maxLength={2000}
              className="w-full resize-y rounded-3xl border border-foreground bg-background p-6 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="heardAbout"
              className="mono block text-xs uppercase tracking-wider opacity-80"
            >
              How did you hear about phyto? How are you using it and how has it impacted you?
            </label>
            <textarea
              id="heardAbout"
              value={heardAbout}
              onChange={(e) => setHeardAbout(e.target.value)}
              placeholder="Type here..."
              rows={4}
              maxLength={1000}
              className="w-full resize-y rounded-3xl border border-foreground bg-background p-6 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="testimony"
              className="mono block text-xs uppercase tracking-wider opacity-80"
            >
              Briefly share your testimony: how did you meet Jesus?
            </label>
            <textarea
              id="testimony"
              value={testimony}
              onChange={(e) => setTestimony(e.target.value)}
              placeholder="Type here..."
              rows={6}
              maxLength={3000}
              className="w-full resize-y rounded-3xl border border-foreground bg-background p-6 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="motivation"
              className="mono block text-xs uppercase tracking-wider opacity-80"
            >
              Why do you want to contribute to this project?
            </label>
            <textarea
              id="motivation"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="Type here..."
              rows={6}
              maxLength={2000}
              className="w-full resize-y rounded-3xl border border-foreground bg-background p-6 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="aiExperience"
              className="mono block text-xs uppercase tracking-wider opacity-80"
            >
              What is your experience using AI? How are you intentional in how you use it?
            </label>
            <textarea
              id="aiExperience"
              value={aiExperience}
              onChange={(e) => setAiExperience(e.target.value)}
              placeholder="Type here..."
              rows={6}
              maxLength={2000}
              className="w-full resize-y rounded-3xl border border-foreground bg-background p-6 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30"
            />
          </div>

          <div className="flex flex-col items-end gap-3">
            {status === "success" && (
              <p className="mono text-xs uppercase tracking-wider text-[var(--brand-green)]">
                Thanks for reaching out! We'll follow up soon.
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
              {status === "submitting" ? "Sending..." : "Submit"}
            </button>
          </div>
        </form>

        <div className="mt-12">
          <BackToTop />
        </div>
      </main>

      <Footer />
    </div>
  );
}
