import { defineConfig } from "@playwright/test";
import checkout from "./playwright.paddle-checkout.config";

// Dedicated local, mocked-provider verification of the bounded billing delta.
// The checkout config rejects hosted API/base URLs before fixtures can run.
export default defineConfig({
  ...checkout,
  testMatch: [
    "**/paddle-checkout.spec.ts",
    "**/paddle-plan-change.spec.ts",
    "**/paddle-coach-seats.spec.ts",
    "**/paddle-payment-method.spec.ts",
  ],
  use: { ...checkout.use, trace: "off", video: "off", screenshot: "off" },
  webServer: {
    ...checkout.webServer,
    env: {
      VITE_BILLING_PROVIDER: "paddle",
      VITE_SENTRY_DSN: "",
      VITE_PADDLE_SANDBOX_CLIENT_TOKEN: `test_${"a".repeat(27)}`,
    },
  },
});
