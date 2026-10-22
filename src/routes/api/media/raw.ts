import { createFileRoute } from "@tanstack/react-router";
import { isOwnMediaUrl } from "@/lib/gathering-export";

// Same-origin read of our own R2 media for gathering export. The media
// domains send no CORS headers, so the browser can't draw their images or
// video frames into a canvas directly. Only our two media hosts are allowed
// (no open proxy); the files are public already. Range is passed through so a
// video frame can be grabbed without downloading the whole file.
export const Route = createFileRoute("/api/media/raw")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("u") ?? "";
        if (!isOwnMediaUrl(target)) {
          return new Response("Not found", { status: 404 });
        }
        const headers: Record<string, string> = {};
        const range = request.headers.get("range");
        if (range) headers.range = range;
        let upstream: Response;
        try {
          upstream = await fetch(target, { headers });
        } catch {
          return new Response("Upstream failed", { status: 502 });
        }
        if (!upstream.ok && upstream.status !== 206) {
          return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
        }
        const out = new Headers();
        for (const h of [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "etag",
        ]) {
          const v = upstream.headers.get(h);
          if (v) out.set(h, v);
        }
        out.set("cache-control", "private, max-age=3600");
        return new Response(upstream.body, { status: upstream.status, headers: out });
      },
    },
  },
});
