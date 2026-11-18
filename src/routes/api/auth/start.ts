import { createFileRoute } from "@tanstack/react-router";
import { authorizeUrl, readStart } from "@/lib/web-sign-in";

/**
 * The first page of Google sign in inside the iPhone app's system sheet
 * (lib/web-sign-in.ts): on phyto's own address, so iOS names phyto, not
 * Supabase. It only sends the sheet on to Google.
 */
export const Route = createFileRoute("/api/auth/start")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const start = readStart(url.searchParams);
        if (!start) return new Response("Bad request", { status: 400 });
        return new Response(null, {
          status: 302,
          headers: {
            Location: authorizeUrl(start.provider, url.origin, start.state, start.nonce),
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
