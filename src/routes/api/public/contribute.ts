import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { z } from "zod";
import { readEnv, makeRateLimiter } from "@/lib/worker-env";

const CATEGORIES = [
  "App Development",
  "Backend Development",
  "UI/UX Design",
  "Graphic Design",
  "Social Media",
  "Other",
] as const;

const ContributeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(255).email(),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  portfolio: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  experience: z.string().trim().min(1).max(2000),
  heardAbout: z.string().trim().min(1).max(1000),
  testimony: z.string().trim().min(1).max(3000),
  motivation: z.string().trim().min(1).max(2000),
  aiExperience: z.string().trim().min(1).max(2000),
});

const rateLimited = makeRateLimiter();

export const Route = createFileRoute("/api/public/contribute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = await readEnv("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = await readEnv("SUPABASE_SERVICE_ROLE_KEY");
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          return Response.json(
            { ok: false, error: "Contribute destination is not configured." },
            { status: 500 },
          );
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        if (rateLimited(ip)) {
          return Response.json(
            { ok: false, error: "Too many submissions. Please try again shortly." },
            { status: 429 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
        }

        const parsed = ContributeSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "Invalid submission." }, { status: 400 });
        }

        const {
          name,
          email,
          categories,
          portfolio,
          experience,
          heardAbout,
          testimony,
          motivation,
          aiExperience,
        } = parsed.data;
        const userAgent = request.headers.get("user-agent") ?? "";

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        });
        const { error } = await supabase.from("contributors").insert({
          name,
          email,
          categories,
          portfolio: portfolio ?? null,
          experience,
          heard_about: heardAbout,
          testimony,
          motivation,
          ai_experience: aiExperience,
          user_agent: userAgent,
        });

        if (error) {
          console.error(`Contribute insert failed: ${error.message}`);
          return Response.json(
            { ok: false, error: "Could not save your submission. Please try again later." },
            { status: 502 },
          );
        }

        const RESEND_API_KEY = await readEnv("RESEND_API_KEY");
        const RESEND_FROM = await readEnv("RESEND_FROM");
        if (RESEND_API_KEY && RESEND_FROM) {
          try {
            const resend = new Resend(RESEND_API_KEY);
            await resend.emails.send({
              from: RESEND_FROM,
              to: "hello@studioliturgy.com",
              subject: `[Phyto Contribute] ${name}`,
              text: [
                `Name: ${name}`,
                `Email: ${email}`,
                `Categories: ${categories.join(", ")}`,
                `Portfolio/Instagram: ${portfolio ?? "not provided"}`,
                `Experience:\n${experience}`,
                `How they heard about phyto:\n${heardAbout}`,
                `Testimony:\n${testimony}`,
                `Why they want to contribute:\n${motivation}`,
                `AI experience:\n${aiExperience}`,
              ].join("\n\n"),
            });
          } catch (emailErr) {
            console.warn(`Contribute email failed: ${emailErr}`);
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
