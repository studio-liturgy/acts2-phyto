import { createFileRoute, redirect } from "@tanstack/react-router";

// `/legal` was the old combined Terms/Privacy page (tabs switched via `#hash`).
// It's now split into dedicated, individually-indexable `/terms` and `/privacy`
// routes. Keep `/legal` as a permanent redirect so old links and bookmarks —
// including `/legal#privacy` / `#online` — still land on the right doc/section.
export const Route = createFileRoute("/legal")({
  beforeLoad: ({ location }) => {
    const hash = location.hash ?? "";
    const to = hash.includes("privacy") ? "/privacy" : "/terms";
    throw redirect({ to, hash: hash.includes("online") ? "online" : undefined });
  },
});
