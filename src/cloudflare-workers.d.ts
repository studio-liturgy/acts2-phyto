// Ambient declaration for the Cloudflare Workers runtime module. `cloudflare:workers`
// only exists at runtime in the Worker, so the API routes import it dynamically
// inside a try/catch (see lib/worker-env.ts). This shim just gives `tsc` the type
// so a clean typecheck passes; it ships no code.
declare module "cloudflare:workers" {
  export const env: Record<string, string | undefined>;
}
