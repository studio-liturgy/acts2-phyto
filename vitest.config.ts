// Standalone config: vite.config.ts pulls in the full @lovable.dev/vite-tanstack-config
// bundle (tanstack start + cloudflare plugins), which only behaves inside a real build.
// Tests need nothing from it beyond the `@/` alias.
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    env: {
      // supabase.ts calls createClient at import time and throws on undefined;
      // network-touching tests mock @/lib/supabase, these just keep imports safe.
      VITE_SUPABASE_URL: "http://supabase.test",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
