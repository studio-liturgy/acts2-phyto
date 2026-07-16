import { defineConfig, devices } from "@playwright/test";

// Local-only for now (needs the Supabase service-role key from .dev.vars for
// session minting; CI runs the unit suite). Port 4173 dodges any dev server
// already running on the default 5173.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 120_000,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bunx vite dev --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
