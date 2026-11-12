// Ambient declaration for the Cloudflare Workers runtime module. `cloudflare:workers`
// only exists at runtime in the Worker, so the API routes import it dynamically
// inside a try/catch (see lib/worker-env.ts). This shim just gives `tsc` the type
// so a clean typecheck passes; it ships no code.
declare module "cloudflare:workers" {
  export const env: Record<string, string | undefined>;
  export function waitUntil(promise: Promise<unknown>): void;
  /** Base class of a Durable Object (src/room/screen-room.ts). */
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

// The slice of the Durable Object and WebSocket Hibernation APIs the screen
// room uses (the full types live in @cloudflare/workers-types, not installed).
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(keys: string | string[]): Promise<unknown>;
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
  deleteAll(): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  setWebSocketAutoResponse(pair?: WebSocketRequestResponsePair): void;
}
interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string);
}
interface WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface ResponseInit {
  webSocket?: WebSocket | null;
}
