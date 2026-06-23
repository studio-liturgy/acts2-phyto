// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type Plugin } from "vite";

// Abort the build if the public Supabase client vars are missing. They are inlined
// at build time; a bundle built without them throws "supabaseUrl is required." during
// SSR and 500s every route. Failing here makes a broken artifact impossible to ship.
function requireSupabaseEnv(): Plugin {
  return {
    name: "require-supabase-env",
    config(_config, { command, mode }) {
      if (command !== "build") return;
      const env = loadEnv(mode, process.cwd(), "");
      const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter(
        (key) => !env[key],
      );
      if (missing.length > 0) {
        throw new Error(
          `Build aborted: missing required env ${missing.join(", ")}. ` +
            `These are public Supabase client values and must be set (see .env).`,
        );
      }
    },
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [requireSupabaseEnv()],
  },
});
