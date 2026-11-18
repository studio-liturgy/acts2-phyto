import { createFileRoute } from "@tanstack/react-router";
import { FINISH_PATH, forwardFragment } from "@/lib/web-sign-in";

/**
 * Sign in with Apple on the website: Apple posts its answer here (a form, as
 * it does whenever the name and email are asked for). Forward the fields we
 * use to /auth/web in the fragment, which never reaches a server or a log;
 * the page there hands the identity token to Supabase.
 */
export const Route = createFileRoute("/api/auth/apple")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let fragment = "error=invalid_request";
        try {
          fragment = forwardFragment(await request.formData()) || fragment;
        } catch {
          // Not a form: finish with an error instead.
        }
        return new Response(null, {
          status: 303,
          headers: {
            Location: `${FINISH_PATH}#${fragment}`,
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      },
    },
  },
});
