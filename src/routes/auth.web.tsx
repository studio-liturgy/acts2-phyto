import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { APP_NAME } from "@/lib/appConfig";
import { finishWebSignIn } from "@/lib/web-sign-in-client";
import { appReturnUrl, isAppState } from "@/lib/web-sign-in";
import { sendWelcomeIfNew } from "@/lib/welcome";
import { isTesterEmail } from "@/lib/auth";
import { TESTERS_ONLY } from "@/lib/testers";
import { supabase } from "@/lib/supabase";

/** Where Apple's and Google's answers land in a browser (lib/web-sign-in.ts). */
export const Route = createFileRoute("/auth/web")({
  head: () => ({
    meta: [{ title: APP_NAME }, { name: "robots", content: "noindex" }],
  }),
  component: WebSignInFinish,
});

function WebSignInFinish() {
  const navigate = useNavigate();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    const hash = window.location.hash;
    // Inside the app's sign-in sheet: hand the answer back to the app,
    // which closes the sheet and finishes the sign in there.
    const state = new URLSearchParams(hash.replace(/^#/, "")).get("state");
    if (isAppState(state)) {
      window.location.replace(appReturnUrl(hash));
      return;
    }
    // The token leaves the address bar (and the history entry) at once.
    window.history.replaceState(null, "", window.location.pathname);
    void finishWebSignIn(hash).then(async (r) => {
      if (!r.ok) {
        navigate({ to: "/login", search: r.cancelled ? {} : { error: r.error } });
        return;
      }
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      // No welcome email for a sign-in phytoexp is about to turn away.
      if (user && (!TESTERS_ONLY || (await isTesterEmail(user.email ?? "")) === true)) {
        await sendWelcomeIfNew(user);
      }
      navigate({ to: "/" });
    });
  }, [navigate]);

  return <div className="min-h-screen bg-background" />;
}
