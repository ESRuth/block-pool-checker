import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const PORT = 8090;

/**
 * Drives the real app in a phone-sized browser against the production path: the built web app served by the API, in memory,
 * with the stub reader (recorded names/digits, one recorded game). No model calls, no network, no cost.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Pixel 7"], trace: "retain-on-failure" },
  webServer: {
    command: "pnpm --filter @bpc/web build && pnpm --filter @bpc/api start",
    cwd: root,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { PORT: String(PORT), INVITE_CODE: "e2e-owner-code", READER: "stub", WEB_DIR: resolve(root, "apps/web/dist") },
  },
});
