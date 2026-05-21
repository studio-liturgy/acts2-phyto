import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const SITE_PASSWORD = "acts24247";
const COOKIE_NAME = "phyto_access";
const COOKIE_VALUE = "1";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const ACCESS_COOKIE = `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=None; Secure; Partitioned`;

function renderGatePage(error?: string, redirectTo = "/"): string {
  const errorHtml = error
    ? `<p style="font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.05em;text-transform:uppercase;margin:0">${error}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>phyto — enter password</title>
    <style>
      :root { --blue:#1d4ed8; --white:#ffffff; }
      html,body{margin:0;height:100%;background:var(--blue);color:var(--white);font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}
      body{display:flex;align-items:center;justify-content:center;padding:24px}
      form{width:100%;max-width:360px;text-align:center;display:flex;flex-direction:column;gap:24px}
      .mark{font-size:48px;font-weight:600;letter-spacing:-0.045em;margin:0}
      .hint{font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0}
      input{width:100%;box-sizing:border-box;border:2px solid var(--white);background:transparent;color:var(--white);text-align:center;padding:12px 20px;border-radius:9999px;font-family:ui-monospace,Menlo,monospace;font-size:14px;outline:none}
      input::placeholder{color:rgba(255,255,255,.6)}
      button{width:100%;border:0;background:var(--white);color:var(--blue);padding:12px 20px;border-radius:9999px;font-family:ui-monospace,Menlo,monospace;font-size:14px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
      button:hover{opacity:.9}
    </style>
  </head>
  <body>
    <form method="POST" action="/__gate">
      <h1 class="mark">phyto</h1>
      <p class="hint">Enter password to continue</p>
      <input autofocus type="password" name="password" placeholder="Password" />
      ${errorHtml}
      <input type="hidden" name="redirect" value="${redirectTo.replace(/"/g, "&quot;")}" />
      <button type="submit">Enter</button>
    </form>
  </body>
</html>`;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1));
  }
  return out;
}

function isSafeRedirect(target: string): boolean {
  return target.startsWith("/") && !target.startsWith("//");
}

const passwordGateMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get("cookie"));
  const unlocked = cookies[COOKIE_NAME] === COOKIE_VALUE;

  // Handle the gate submission endpoint
  if (url.pathname === "/__gate") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const form = await request.formData();
    const submitted = String(form.get("password") ?? "");
    const redirectRaw = String(form.get("redirect") ?? "/");
    const redirectTo = isSafeRedirect(redirectRaw) ? redirectRaw : "/";

    if (submitted === SITE_PASSWORD) {
      return new Response(null, {
        status: 303,
        headers: {
          location: redirectTo,
          "set-cookie": ACCESS_COOKIE,
          "cache-control": "no-store",
        },
      });
    }
    return new Response(renderGatePage("Incorrect password", redirectTo), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (unlocked) return next();

  // Only gate HTML navigations; let assets/data fall through with 401 to avoid leaking
  const accept = request.headers.get("accept") ?? "";
  if (request.method === "GET" && accept.includes("text/html")) {
    return new Response(renderGatePage(undefined, url.pathname + url.search), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response("Unauthorized", { status: 401 });
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, passwordGateMiddleware],
}));
