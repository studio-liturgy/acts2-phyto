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

    supabase.auth.exchangeCodeForSession(window.location.href).then(({ error }) => {
      if (error) {
        navigate({ to: "/login", search: { error: error.message } });
      } else {
        navigate({ to: "/" });
      }
    });
  }, [navigate]);

  return null;
}
