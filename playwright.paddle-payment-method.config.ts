import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
for (const name of [
  "E2E_BASE_URL",
  "E2E_SUPABASE_API_URL",
  "VITE_SUPABASE_URL",
]) {
  const value = process.env[name];
  if (value && !["localhost", "127.0.0.1"].includes(new URL(value).hostname))
    throw new Error("Payment-method browser tests require local services");
}
export default defineConfig({
  ...base,
  testMatch: "**/paddle-payment-method.spec.ts",
  testIgnore: [],
  globalSetup: "./tests/e2e/utils/server-readiness.ts",
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:4176",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4176 --strictPort",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_BILLING_PROVIDER: "paddle",
      VITE_SENTRY_DSN: "",
      VITE_PADDLE_SANDBOX_CLIENT_TOKEN: `test_${"a".repeat(27)}`,
    },
  },
});
