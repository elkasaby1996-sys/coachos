import { defineConfig, devices } from "@playwright/test";

// Public-only checks against the built site: no auth fixtures or database seeds.
export default defineConfig({
  testDir: ".",
  testMatch: "public-marketing.spec.ts",
  timeout: 60_000,
  workers: 2,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    storageState: { cookies: [], origins: [] },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
