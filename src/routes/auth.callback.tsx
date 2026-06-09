import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    supabase.auth.exchangeCodeForSession(window.location.href).then(async ({ data, error }) => {
      if (error) {
        navigate({ to: "/login", search: { error: error.message } });
        return;
      }

      if (data.user) {
        const isNew = Date.now() - new Date(data.user.created_at).getTime() < 60_000;
        if (isNew) {
          const subscribe = sessionStorage.getItem("phyto-subscribe") === "true";
          sessionStorage.removeItem("phyto-subscribe");
          await fetch("/api/auth/welcome", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: data.user.email,
              name: data.user.user_metadata?.full_name ?? undefined,
              subscribe,
            }),
          }).catch(() => {});
        }
      }

      navigate({ to: "/" });
    });
  }, [navigate]);

  return null;
}
