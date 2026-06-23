export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @font-face {
        font-family: "Space Mono";
        src: url("/fonts/SpaceMono-Regular.ttf") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      :root {
        --background: #F5EFEF;
        --foreground: #212121;
        --primary: #212121;
        --primary-foreground: #F5EFEF;
        --accent: #ECE6E6;
        --border: #212121;
        --muted-foreground: #6F6868;
      }

      * { box-sizing: border-box; }

      body {
        font-family: Arial, Helvetica, sans-serif;
        letter-spacing: -0.03em;
        font-size: 15px;
        line-height: 1.5;
        background-color: var(--background);
        color: var(--foreground);
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
        padding: 1.5rem;
      }

      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }

      .label {
        font-family: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--muted-foreground);
        margin: 0 0 0.75rem;
      }

      h1 { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.045em; margin: 0 0 0.5rem; }
      p { font-size: 0.875rem; color: var(--muted-foreground); margin: 0 0 1.75rem; }

      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 2.25rem;
        padding: 0.5rem 1rem;
        border-radius: 1.125rem;
        font-family: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.875rem;
        font-weight: 400;
        letter-spacing: 0;
        text-transform: uppercase;
        cursor: pointer;
        text-decoration: none;
        border: 1px solid transparent;
        transition: background-color 0.15s, color 0.15s;
      }
      .primary { background: var(--primary); color: var(--primary-foreground); }
      .primary:hover { background: rgba(33, 33, 33, 0.9); }
      .secondary { background: var(--background); color: var(--foreground); border-color: var(--border); }
      .secondary:hover { background: var(--accent); }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="label">Error</p>
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="btn primary" onclick="location.reload()">Try again</button>
        <a class="btn secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
