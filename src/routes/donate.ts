import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { nativePlatformFromUA } from "@/lib/native-app";

const STRIPE_DONATE_URL = "https://donate.stripe.com/bJe14gbwwbucdfac9E8og00";
const CONTACT_MAILTO = "mailto:hello@studioliturgy.com";

// Plain hand-rolled HTML, not a React route: this page needs no app chrome,
// and keeping it a single static response makes the native-app redirect (and
// this page itself) trivial to reason about and fast to serve.
const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Donate | phyto</title>
<style>
  @font-face {
    font-family: 'Space Mono';
    src: url('/fonts/SpaceMono-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2e7299;
    color: #f5efef;
    font-family: Arial, Helvetica, sans-serif;
    padding: 2rem;
  }
  .wrap { max-width: 640px; text-align: center; }
  h1 { font-size: 2.1rem; font-weight: 400; margin: 0 0 2rem; }
  p {
    font-family: 'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    text-transform: uppercase;
    font-size: 0.85rem;
    line-height: 1.7;
    letter-spacing: 0.02em;
    margin: 0 0 0.75rem;
    opacity: 0.9;
  }
  .buttons {
    margin-top: 2.5rem;
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .btn {
    display: inline-block;
    background: #f5efef;
    color: #2e7299;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: 700;
    font-size: 1.3rem;
    text-decoration: none;
    padding: 0.9rem 2.6rem;
    border-radius: 9999px;
    transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.85; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Thank you for considering donating!</h1>
    <p>To give with standard credit cards, please select Stripe.</p>
    <p>To give via Wise, e-transfer or to set up recurring donations, please contact me through the button on the right.</p>
    <div class="buttons">
      <a class="btn" href="${STRIPE_DONATE_URL}" target="_blank" rel="noopener noreferrer">Stripe</a>
      <a class="btn" href="${CONTACT_MAILTO}">Contact</a>
    </div>
  </div>
</body>
</html>`;

export const Route = createFileRoute("/donate")({
  server: {
    handlers: {
      // Giving stays out of the phyto app (store payment rules): there, the
      // link goes home instead. Everywhere else, offer a choice of Stripe
      // (self-serve) or Contact (Wise, e-transfer, recurring: arranged by hand).
      GET: ({ request }) => {
        if (nativePlatformFromUA(request.headers.get("user-agent") ?? "")) {
          return new Response(null, { status: 302, headers: { location: "/" } });
        }
        return new Response(PAGE_HTML, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  },
});
