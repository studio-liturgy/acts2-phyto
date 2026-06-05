# Email assets

Static images referenced by `email-templates/magic-link.html`. Served at
`https://phyto.live/email/<file>` in production.

Email clients can't use SVG or CSS background-images reliably, so these must be
flattened **PNG** exports.

| File | Used for | Export spec |
|------|----------|-------------|
| `magic-link-header.png` | Hero band: textured background + `phyto` wordmark, flattened into one image | 1200px wide (2× for retina), displayed at 600px |
| `arrow.png` | The `ArrowUpRight` icon beside the "Sign In" button label | White, ~44px square, transparent background |

The footer font (`SpaceMono-Regular.ttf`) is already hosted at `/fonts/` — nothing
to add here for it.

When images are blocked by the client, the template falls back to `alt` text
(`phyto` for the header, `↗` for the arrow).
