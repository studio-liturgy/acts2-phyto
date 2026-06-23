import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const STRIPE_DONATE_URL = "https://donate.stripe.com/bJe14gbwwbucdfac9E8og00";

export const Route = createFileRoute("/donate")({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          status: 302,
          headers: { location: STRIPE_DONATE_URL },
        }),
    },
  },
});
