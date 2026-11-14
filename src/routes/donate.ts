import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { nativePlatformFromUA } from "@/lib/native-app";

const STRIPE_DONATE_URL = "https://donate.stripe.com/bJe14gbwwbucdfac9E8og00";

export const Route = createFileRoute("/donate")({
  server: {
    handlers: {
      // Giving stays out of the phyto app (store payment rules): there, the
      // link goes home instead.
      GET: ({ request }) =>
        new Response(null, {
          status: 302,
          headers: {
            location: nativePlatformFromUA(request.headers.get("user-agent") ?? "")
              ? "/"
              : STRIPE_DONATE_URL,
          },
        }),
    },
  },
});
