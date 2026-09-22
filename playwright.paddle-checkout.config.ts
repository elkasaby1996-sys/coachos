import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Separate local build selection; no saved environment or hosted accounts.
for (const name of [
  "E2E_BASE_URL",
  "E2E_SUPABASE_API_URL",
  "VITE_SUPABASE_URL",
]) {
  const value = process.env[name];
  if (value && !["localhost", "127.0.0.1"].includes(new URL(value).hostname))
    throw new Error("Paddle browser tests require local services");
}
export default defineConfig({
  ...base,
  testMatch: "**/paddle-checkout.spec.ts",
  testIgnore: [],
  workers: 1,
  globalSetup: "./tests/e2e/utils/server-readiness.ts",
  use: { ...base.use, baseURL: "http://127.0.0.1:4175" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_BILLING_PROVIDER: "paddle", VITE_SENTRY_DSN: "" },
  },
});
