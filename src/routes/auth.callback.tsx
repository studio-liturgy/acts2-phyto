import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
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
