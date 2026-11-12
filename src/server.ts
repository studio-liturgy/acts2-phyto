import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { PHONE_UI } from "./lib/phone-layout";
import { ownerOfSlug, roomName } from "./lib/screen-auth";

// Present from a phone (n133): the screen room, one Durable Object per share
// link's account or group.
export { ScreenRoom } from "./room/screen-room";

/** `/screen-room/<slug>` is the remote's and the screens' socket. */
const SCREEN_ROOM_PATH = /^\/screen-room\/([A-Za-z0-9_-]{1,64})$/;

async function screenRoom(request: Request, env: unknown, slug: string): Promise<Response> {
  const ns = (env as { SCREEN_ROOM?: DurableObjectNamespace } | null)?.SCREEN_ROOM;
  if (!PHONE_UI || !ns) return new Response("Not found", { status: 404 });
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  const owner = await ownerOfSlug(
    slug.toLowerCase(),
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  ).catch(() => null);
  if (!owner) return new Response("Not found", { status: 404 });
  const headers = new Headers(request.headers);
  headers.set("x-room-owner", JSON.stringify(owner));
  const stub = ns.get(ns.idFromName(roomName(owner)));
  return stub.fetch(new Request(request, { headers }));
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const room = new URL(request.url).pathname.match(SCREEN_ROOM_PATH);
    if (room) return screenRoom(request, env, room[1]);
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
