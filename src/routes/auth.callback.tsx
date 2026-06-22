import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/appConfig";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: APP_NAME },
    ],
  }),
  component: AuthCallback,
});

async function sendWelcomeIfNew(user: { email?: string; created_at: string; user_metadata?: Record<string, unknown> }) {
  const ageMs = Date.now() - new Date(user.created_at).getTime();
  const isNew = ageMs < 600_000;
  if (!isNew || !user.email) return;

  const subscribe = sessionStorage.getItem("phyto-subscribe") === "true";
  sessionStorage.removeItem("phyto-subscribe");
  try {
    const res = await fetch("/api/auth/welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        name: user.user_metadata?.full_name ?? undefined,
        subscribe,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`Welcome email request failed: ${res.status} ${detail}`);
    }
  } catch (err) {
    console.warn("Welcome email request error:", err);
  }
}

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
        if (data.user) await sendWelcomeIfNew(data.user);
        navigate({ to: "/" });
      });
    } else {
      // Hash/implicit flow — session already set by Supabase JS listener.
      // Wait briefly for the session to be available, then send welcome email.
      supabase.auth.getSession().then(async ({ data }) => {
        if (data.session?.user) {
          await sendWelcomeIfNew(data.session.user);
        }
        navigate({ to: "/" });
      });
    }
  }, [navigate]);

  return null;
}
