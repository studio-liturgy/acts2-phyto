import { DurableObject } from "cloudflare:workers";
import {
  parseMessage,
  type RemoteMeta,
  type RemoteLive,
  type RemoteToRoom,
  type RoomToRemote,
  type RoomToScreen,
  type ScreenToRoom,
  type SetPart,
} from "../lib/remote-protocol";
import { canDrive, type RoomOwner } from "../lib/screen-auth";

/**
 * Present from a phone (n133): one room per account or group share link.
 * Remotes (signed-in phones) drive it; screens (/screen/<slug>, no login)
 * only watch, several at once. The room keeps the gathering, the sets and the
 * live slide in storage, so a screen that joins or reloads gets the current
 * slide at once, even while the remote is away, and a remote that reconnects
 * only resends sets that changed. Every live change gets a sequence number,
 * so screens never step back to an older state.
 *
 * WebSocket Hibernation: an idle room costs nothing between messages; pings
 * are answered without waking it.
 */

type Role = "remote" | "screen";
interface Attachment {
  role: Role;
  authed: boolean;
}

const OWNER = "owner";
const META = "m";
const LIVE = "l";
const HAVE = "h";
const PART = "s:";
const partKey = (id: string, i: number) => `${PART}${id}:${String(i).padStart(4, "0")}`;

export class ScreenRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const role: Role =
      new URL(request.url).searchParams.get("role") === "remote" ? "remote" : "screen";
    const owner = request.headers.get("x-room-owner");
    if (owner) await this.ctx.storage.put(OWNER, JSON.parse(owner) as RoomOwner);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, authed: false } satisfies Attachment);
    if (role === "screen") {
      await this.replay(server);
      this.sendScreenCount();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    if (att.role === "screen") {
      const m = parseMessage<ScreenToRoom>(raw);
      if (m?.t === "ended") this.toRemotes({ t: "ended", nonce: m.nonce });
      else if (m?.t === "vtime") {
        this.toRemotes({
          t: "vtime",
          slideId: m.slideId,
          current: m.current,
          duration: m.duration,
        });
      }
      return;
    }
    const m = parseMessage<RemoteToRoom>(raw);
    if (!m) return;
    if (!att.authed) {
      if (m.t !== "auth") return;
      const owner = await this.ctx.storage.get<RoomOwner>(OWNER);
      const ok =
        !!owner &&
        (await canDrive(
          m.token,
          owner,
          import.meta.env.VITE_SUPABASE_URL as string,
          import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        ).catch(() => false));
      if (!ok) {
        send(ws, { t: "auth", ok: false } satisfies RoomToRemote);
        ws.close(4001, "Not allowed");
        return;
      }
      ws.serializeAttachment({ role: "remote", authed: true } satisfies Attachment);
      send(ws, { t: "auth", ok: true } satisfies RoomToRemote);
      const have = (await this.ctx.storage.get<Record<string, string>>(HAVE)) ?? {};
      send(ws, { t: "have", sets: have } satisfies RoomToRemote);
      send(ws, { t: "screens", n: this.screens().length } satisfies RoomToRemote);
      return;
    }
    switch (m.t) {
      case "meta":
        await this.ctx.storage.put(META, m.meta);
        this.toScreens({ t: "meta", meta: m.meta });
        return;
      case "part":
        await this.storePart(m);
        this.toScreens(m);
        return;
      case "live": {
        const prev = await this.ctx.storage.get<{ seq: number; live: RemoteLive }>(LIVE);
        const seq = (prev?.seq ?? 0) + 1;
        await this.ctx.storage.put(LIVE, { seq, live: m.live });
        this.toScreens({ t: "live", seq, live: m.live });
        return;
      }
      case "reset": {
        const owner = await this.ctx.storage.get<RoomOwner>(OWNER);
        await this.ctx.storage.deleteAll();
        if (owner) await this.ctx.storage.put(OWNER, owner);
        this.toScreens({ t: "reset" });
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.closed(ws, code);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.closed(ws, 1011);
  }

  private closed(ws: WebSocket, code: number) {
    try {
      // 1005/1006 can't be sent back; close normally instead.
      ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000);
    } catch {}
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att?.role === "screen") this.sendScreenCount(ws);
  }

  /** A part of a set. The first part of a new version drops the old one's
   *  leftover parts; the last marks the set as held in full. */
  private async storePart(p: SetPart) {
    const have = (await this.ctx.storage.get<Record<string, string>>(HAVE)) ?? {};
    if (p.i === 0) {
      const old = await this.ctx.storage.list({ prefix: `${PART}${p.id}:` });
      const stale = [...old.keys()].filter((k) => Number(k.slice(-4)) >= p.n);
      if (stale.length) await this.ctx.storage.delete(stale);
      if (have[p.id]) {
        delete have[p.id];
        await this.ctx.storage.put(HAVE, have);
      }
    }
    await this.ctx.storage.put(partKey(p.id, p.i), p);
    if (p.i === p.n - 1) {
      have[p.id] = p.v;
      await this.ctx.storage.put(HAVE, have);
    }
  }

  /** Everything a screen joining now needs: the gathering, the sets, then
   *  the live slide. */
  private async replay(ws: WebSocket) {
    const meta = await this.ctx.storage.get<RemoteMeta>(META);
    send(ws, { t: "hello", empty: !meta } satisfies RoomToScreen);
    if (meta) send(ws, { t: "meta", meta } satisfies RoomToScreen);
    const parts = await this.ctx.storage.list<SetPart>({ prefix: PART });
    for (const p of parts.values()) send(ws, p satisfies RoomToScreen);
    const live = await this.ctx.storage.get<{ seq: number; live: RemoteLive }>(LIVE);
    if (live) send(ws, { t: "live", seq: live.seq, live: live.live } satisfies RoomToScreen);
  }

  private screens(except?: WebSocket) {
    return this.ctx.getWebSockets("screen").filter((s) => s !== except);
  }

  private sendScreenCount(except?: WebSocket) {
    this.toRemotes({ t: "screens", n: this.screens(except).length });
  }

  private toScreens(m: RoomToScreen) {
    const text = JSON.stringify(m);
    for (const s of this.screens()) trySend(s, text);
  }

  private toRemotes(m: RoomToRemote) {
    const text = JSON.stringify(m);
    for (const s of this.ctx.getWebSockets("remote")) {
      if ((s.deserializeAttachment() as Attachment | null)?.authed) trySend(s, text);
    }
  }
}

function send(ws: WebSocket, m: RoomToRemote | RoomToScreen) {
  trySend(ws, JSON.stringify(m));
}

function trySend(ws: WebSocket, text: string) {
  try {
    ws.send(text);
  } catch {
    // Closing socket: its close handler tidies up.
  }
}
