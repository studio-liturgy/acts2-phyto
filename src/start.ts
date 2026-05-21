import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const SITE_PASSWORD = "acts24247";
const COOKIE_NAME = "phyto_access";
const COOKIE_VALUE = "1";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const ACCESS_COOKIE = `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=None; Secure; Partitioned`;

const WORDMARK_SVG = `<svg width="120" height="78" viewBox="0 0 416 271" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:4px auto">
<path fill-rule="evenodd" clip-rule="evenodd" d="M110.92 4.18979C111.275 3.89617 118.634 1.10596 121.713 3.24866C128.411 7.90941 128.432 8.28644 128.472 8.99535C129.08 19.8834 129.625 19.8765 128.564 30.7526C127.278 43.9323 127.166 43.874 127.077 45.0183C126.311 54.8312 126.707 54.8533 126.507 55.6837C125.978 57.8704 126.8 57.9271 126.268 60.1312C125.922 61.562 125.893 70.6812 125.866 70.7956C125.67 71.6325 125.044 98.4587 125.072 98.669C124.997 98.8797 124.745 98.9955 124.67 99.2061C124.499 99.6843 124.853 99.2904 125.383 99.227C125.796 98.1774 130.176 87.0386 131.43 86.4853C140.661 82.4125 141.482 82.6276 142.374 82.8612C145.044 83.5609 151.359 84.4934 155.971 92.09C157.725 94.9795 162.056 118.507 162.76 120.542C163.054 121.39 162.757 121.442 164.81 131.576C169.27 153.588 169.922 165.036 180.046 190.781C180.55 192.064 179.275 192.335 174.097 195.327C170.643 197.322 159.063 199.2 158.039 197.017C151.323 182.69 148.744 170.192 148.246 167.776C145.317 153.582 147.388 153.247 143.923 139.186C141.596 129.743 138.817 121.826 138.482 123.031C135.092 135.227 131.883 139.377 126.437 175.928C125.333 183.341 125.203 187.402 125.171 188.404C125.098 190.701 124.628 190.609 124.564 192.87C124.495 195.344 124.951 195.54 124.055 196.4C123.956 196.494 111.019 197.748 109.824 196.704C103.579 191.251 101.937 182.373 102.942 178.353C102.968 178.251 103.148 159.242 103.358 158.369C104.094 155.317 103.783 122.691 104.283 120.616C104.32 120.465 104.562 103.808 104.796 102.847C104.858 102.594 103.744 13.4675 103.108 11.5083C102.665 10.1467 103.476 10.3401 110.92 4.18979Z" fill="white"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M66.1397 266.319C62.1801 265.061 38.3256 214 38.3201 213.974C37.9521 212.206 32.1114 200.412 32.073 200.235C32.0489 200.124 32.4134 199.942 22.9825 182.492C21.3872 179.541 21.1434 179.729 19.5449 176.793C17.5747 173.175 17.3308 173.383 14.3697 170.518C9.16215 165.479 8.86197 165.495 8.82393 163.873C8.5383 151.785 12.0478 148.706 13.3365 145.875C15.2882 141.585 27.3301 134.81 30.1685 132.053C32.2806 130.002 61.4537 125.339 65.98 126.631C82.9138 131.464 87.7098 141.33 90.8526 144.69C93.6671 147.698 91.5142 151.824 91.5236 159.256C91.5275 162.207 90.3503 162.543 89.5588 163.611C84.4635 170.494 81.3011 173.516 80.2172 174.698C67.5205 188.553 66.4756 188.081 56.4553 196.155C54.788 197.498 67.7457 227.346 75.0455 241.203C78.7103 248.16 81.5182 250.102 82.171 251.999C82.5339 253.054 81.443 256.572 81.3516 256.748C78.2099 262.773 76.8531 263.493 72.7182 265.745C69.6267 267.428 69.4588 267.374 66.1397 266.319ZM48.1507 146.395C52.1706 146.399 68.0387 155.658 62.8072 162.729C60.1071 166.378 48.1982 177.788 46.6717 176.049C46.435 175.779 46.7713 175.624 44.9346 171.909C44.4516 170.932 44.6383 170.598 44.4396 170.176C39.9909 160.713 35.7621 154.921 34.8625 153.689C33.6898 152.083 39.2148 148.359 42.4397 147.702C43.6661 147.453 43.5561 146.391 48.1507 146.395Z" fill="white"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M193.375 259.85C188.105 260.93 177.617 249.87 177.375 248.569C177.147 247.339 195.471 217.527 198.92 211.235C199.023 211.047 204.198 202.425 204.248 202.009C204.341 201.234 198.006 189.934 191.107 162.597C188.721 153.144 188.507 153.232 185.346 143.984C181.838 133.719 181.661 133.797 181.357 132.905C179.092 126.273 178.833 126.399 178.688 125.811C178.35 124.445 183.176 124.044 184.5 123.664C195.014 120.642 195.937 120.004 196.435 120.508C199.295 123.403 205.31 135.835 205.98 137.221C213.348 152.45 211.385 153.157 218.949 175.925C219.911 178.822 220.56 176.118 220.981 175.556C222.071 174.101 230.456 160.267 231.266 158.93C231.578 158.416 235.129 152.556 235.163 152.512C237.258 149.776 241.391 142.938 241.905 142.088C242.175 141.642 244.85 137.218 245.356 136.558C247.433 133.852 246.876 132.748 249.637 132.748C257.746 132.748 258.038 132.431 259.039 133.706C259.348 134.098 264.886 144.584 264.997 144.909C265.307 145.807 264.888 145.798 256.946 159.596C251.291 169.421 251.212 169.37 250.733 170.231C247.661 175.766 245.642 178.691 245.416 179.096C236.805 194.544 220.713 215.252 199.435 257.807C198.383 259.912 197.843 259.219 196.429 259.441C193.603 259.886 193.616 259.801 193.375 259.85Z" fill="white"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M297.144 151.54C296.457 162.415 296.63 164.04 300.25 170.739C301.537 173.121 310.476 174.635 310.808 177.784C311.4 183.403 313.17 188.558 311.687 189.007C311.105 189.183 292.91 192.733 292.767 192.726C290.14 192.604 286.219 188.138 282.121 185.627C278.959 183.689 278.022 181.417 277.828 180.947C273.439 170.305 272.568 150.1 274.423 144.674C274.826 143.493 274.501 143.44 276.581 129.223C276.871 127.237 277.062 127.297 277.255 125.283C277.313 124.681 277.347 124.691 278.267 117.79C278.535 115.783 278.744 115.842 278.939 113.849C279.22 111.001 280.622 109.221 278.066 109.826C277.606 109.935 277.551 109.536 272.228 110.76C271.709 110.879 255.825 110.003 255.448 109.536C255.003 108.985 255.469 108.876 255.372 100.69C255.37 100.509 255.102 99.5305 255.106 99.337C255.123 98.4471 255.189 97.5587 255.231 96.6695C255.392 93.1916 253.816 91.8964 257.132 90.9895C258.472 90.6233 265.2 88.1474 273.006 86.313C275.597 85.7041 282.441 85.2469 282.446 85.2437C282.474 85.2199 286.753 67.2798 287.331 63.7725C287.515 62.6542 288.27 61.3421 289.238 55.4639C289.309 55.0383 289.595 55.1172 290.482 50.2172C290.88 48.016 294.104 49.0542 296.952 48.4325C297.511 48.3108 297.52 48.4345 304.086 47.9314C308.322 47.6065 307.018 49.8548 309.346 53.4383C309.442 53.5857 312.152 60.0335 312.18 60.1655C312.363 61.0294 310.769 64.652 309.932 68.4853C309.811 69.0398 307.709 75.6721 306.796 81.5911C306.697 82.2359 306.419 82.1617 306.256 83.7625C305.865 87.5866 309.046 85.7774 312.472 86.9664C315.279 87.9402 315.463 87.072 318.218 88.1045C319.347 88.5277 328.032 90.3858 332.122 91.8766C334.189 92.6296 339.914 93.3935 340.103 94.9529C341.703 108.207 342.09 108.567 341.112 109.15C340.566 109.476 330.596 109.757 322.46 110.326C321.461 110.396 319.555 109.92 317.566 110.335C317.464 110.357 308.05 110.225 306.116 109.403C302.895 108.034 303.027 110.104 302.228 115.482C301.929 117.493 301.786 117.419 301.507 119.429C301.417 120.078 301.139 119.999 300.969 121.602C300.905 122.204 300.772 122.179 299.947 129.093C299.888 129.59 299.595 129.49 299.355 132.15C298.735 139.018 298.443 138.945 297.933 145.82C297.718 148.721 297.544 148.668 297.144 151.54Z" fill="white"/>
<path d="M390.77 134.664L410.433 143.775C415.602 154.819 417.172 166.876 415.141 179.945C415.141 204.057 408.033 225.593 393.817 244.552C386.801 249.522 380.231 254.559 371 255.664L362 255.664C362 255.664 354 257.164 347.5 253.664C341 250.164 334.553 243.172 334.553 243.172C327.075 234.664 327.075 213.905 327.075 197.891C326.152 177.828 333.722 160.801 349.784 146.812C361.969 138.713 375.631 134.664 390.77 134.664ZM367.079 167.45C353.231 180.93 348.038 197.706 351.5 217.779L356.693 230.746C362.673 233.237 369.124 234.043 376.048 233.164L383.838 227.23C389.817 219.318 393.909 210.307 396.112 200.197C398.157 190.234 398.787 179.685 398 168.549L395.404 163.714L383.838 161.516L367.079 167.45Z" fill="white"/>
</svg>`;

function renderGatePage(error?: string, redirectTo = "/"): string {
  const errorHtml = error
    ? `<p style="font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.05em;text-transform:uppercase;margin:1px 0 0 1px">${error}</p>`
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
      .hint{font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0}
      input{width:100%;box-sizing:border-box;border:2px solid var(--white);background:transparent;color:var(--white);text-align:center;padding:12px 20px;border-radius:9999px;font-family:ui-monospace,Menlo,monospace;font-size:14px;outline:none}
      input::placeholder{color:rgba(255,255,255,.6)}
      button{width:100%;border:0;background:var(--white);color:var(--blue);padding:12px 20px;border-radius:9999px;font-family:ui-monospace,Menlo,monospace;font-size:14px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
      button:hover{opacity:.9}
    </style>
  </head>
  <body>
    <form method="POST" action="/__gate">
      ${WORDMARK_SVG}
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
