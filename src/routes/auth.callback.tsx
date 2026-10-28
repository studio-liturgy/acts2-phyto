import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/appConfig";
import { sendWelcomeIfNew } from "@/lib/welcome";
import { isTesterEmail } from "@/lib/auth";
import { TESTERS_ONLY } from "@/lib/testers";
import type { User } from "@supabase/supabase-js";

/** No welcome email for a Google sign-in phytoexp is about to turn away. */
async function welcome(user: User) {
  if (TESTERS_ONLY && (await isTesterEmail(user.email ?? "")) !== true) return;
  await sendWelcomeIfNew(user);
}

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: APP_NAME }, { name: "robots", content: "noindex" }],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    if (code) {
      // PKCE flow — exchange code for session
      supabase.auth.exchangeCodeForSession(window.location.href).then(async ({ data, error }) => {
        if (error) {
          navigate({ to: "/login", search: { error: error.message } });
          return;
        }
        if (data.user) await welcome(data.user);
        navigate({ to: "/" });
      });
    } else {
      // Hash/implicit flow — session already set by Supabase JS listener.
      // Wait briefly for the session to be available, then send welcome email.
      supabase.auth.getSession().then(async ({ data }) => {
        if (data.session?.user) {
          await welcome(data.session.user);
        }
        navigate({ to: "/" });
      });
    }
  }, [navigate]);

  return null;
}
